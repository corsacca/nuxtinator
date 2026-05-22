// Background delivery + housekeeping for the global notification store. Three
// jobs, all scheduled by `plugins/notifications-scheduler.ts`:
//
//   immediate sweep — emails `email_mode = 'immediate'` rows promptly (one
//                     email each), then stamps `emailed_at`.
//   daily digest    — rolls each user's pending `email_mode = 'digest'` rows
//                     into one summary email.
//   retention       — deletes rows older than the retention window.
//
// Email delivery is decoupled from the request that wrote the row, so producers
// never touch the mailer. The cost is a small latency on "immediate" (bounded
// by the sweep interval) — acceptable for email.
//
// ## Multi-tenant reads
//
// The notifications table is RLS-protected in multi mode, so a background job
// (which has no request, hence no `app.current_org` GUC) can't read across
// orgs in one query. Each job therefore iterates org scopes, setting the GUC
// per org — mirroring the per-(user,org) scan the messages digest used to do.
// In single-tenant mode there's exactly one scope (`null`) and no GUC.
//
// This per-org iteration is O(orgs) per sweep; fine at current scale. If the
// org count grows large, replace `listOrgScopes()` with a NOTIFY/LISTEN signal
// or a non-RLS pending-queue table.

import { sql, type Transaction } from 'kysely'
import { db } from '#core/server/utils/database'
import type { Database } from '#core/server/database/schema'
import {
  sendImmediateNotificationEmail,
  sendNotificationDigestEmail,
  type NotificationEmailRow
} from '#core/server/utils/notification-email'

const RETENTION_DAYS = 90

function isTenancyMode(): boolean {
  try {
    const cfg = useRuntimeConfig()
    const paths = (cfg.tenancyMigrationPaths as string[] | undefined) ?? []
    return paths.length > 0
  } catch {
    return false
  }
}

// The set of org scopes a job must visit. `[null]` in single mode (no GUC);
// one entry per org in multi mode.
async function listOrgScopes(): Promise<(string | null)[]> {
  if (!isTenancyMode()) return [null]
  // Raw SQL — `orgs` is a tenancy-only table not in core's Kysely schema.
  const res = await sql<{ id: string }>`select id from orgs`.execute(db)
  return res.rows.map(r => r.id)
}

async function withScopeTx<T>(
  orgId: string | null,
  fn: (tx: Transaction<Database>) => Promise<T>
): Promise<T> {
  return await db.transaction().execute(async (tx) => {
    if (orgId) {
      await sql`select set_config('app.current_org', ${orgId}, true)`.execute(tx)
    }
    return await fn(tx)
  })
}

// Cross-replica gate: only one process per cluster runs a given job. The lock
// is session-scoped, so a crash releases it automatically.
async function withAdvisoryLock(key: string, label: string, fn: () => Promise<void>): Promise<void> {
  const lockRow = await sql<{ got: boolean }>`
    select pg_try_advisory_lock(${sql.raw(key)}::bigint) as got
  `.execute(db)
  if (!lockRow.rows[0]?.got) {
    console.log(`[notifications] another replica holds the ${label} lock — skipping`)
    return
  }
  try {
    await fn()
  } finally {
    await sql`select pg_advisory_unlock(${sql.raw(key)}::bigint)`.execute(db)
  }
}

// Distinct, committed lock keys — don't change without coordinating across
// deployments (a changed key means a different lock during a rolling deploy).
const IMMEDIATE_LOCK_KEY = '8410072391558420017'
const DIGEST_LOCK_KEY = '8410072391558420018'
const RETENTION_LOCK_KEY = '8410072391558420019'

async function selectPending(
  tx: Transaction<Database>,
  mode: 'immediate' | 'digest',
  limit?: number
): Promise<NotificationEmailRow[]> {
  let qb = tx
    .selectFrom('notifications')
    .select(['id', 'user_id', 'title', 'body', 'link'])
    .where('email_mode', '=', mode)
    .where('emailed_at', 'is', null)
    .where('read_at', 'is', null)
    .orderBy('created_at', 'asc')
  if (limit) qb = qb.limit(limit)
  return await qb.execute()
}

async function stampEmailed(orgId: string | null, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await withScopeTx(orgId, async (tx) => {
    await tx
      .updateTable('notifications')
      .set({ emailed_at: sql<Date>`now()` })
      .where('id', 'in', ids)
      .execute()
  })
}

export async function runImmediateSweep(): Promise<void> {
  await withAdvisoryLock(IMMEDIATE_LOCK_KEY, 'immediate', async () => {
    for (const orgId of await listOrgScopes()) {
      let rows: NotificationEmailRow[] = []
      await withScopeTx(orgId, async (tx) => {
        rows = await selectPending(tx, 'immediate', 200)
      })
      if (rows.length === 0) continue
      // Send outside the txn so mailer latency doesn't hold a DB connection.
      for (const row of rows) {
        await sendImmediateNotificationEmail(row)
      }
      await stampEmailed(orgId, rows.map(r => r.id))
    }
  })
}

export async function runDigest(): Promise<void> {
  await withAdvisoryLock(DIGEST_LOCK_KEY, 'digest', async () => {
    // One digest email per user, aggregated across all of that user's orgs.
    const perUser = new Map<string, NotificationEmailRow[]>()
    const idsByOrg = new Map<string | null, string[]>()

    for (const orgId of await listOrgScopes()) {
      await withScopeTx(orgId, async (tx) => {
        const rows = await selectPending(tx, 'digest')
        const ids = idsByOrg.get(orgId) ?? []
        for (const row of rows) {
          const list = perUser.get(row.user_id) ?? []
          list.push(row)
          perUser.set(row.user_id, list)
          ids.push(row.id)
        }
        if (ids.length > 0) idsByOrg.set(orgId, ids)
      })
    }

    let sent = 0
    for (const [userId, rows] of perUser.entries()) {
      await sendNotificationDigestEmail(userId, rows)
      sent++
    }
    for (const [orgId, ids] of idsByOrg.entries()) {
      await stampEmailed(orgId, ids)
    }
    console.log(`[notifications] digest sent ${sent} email(s)`)
  })
}

export async function runRetention(): Promise<void> {
  await withAdvisoryLock(RETENTION_LOCK_KEY, 'retention', async () => {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
    for (const orgId of await listOrgScopes()) {
      await withScopeTx(orgId, async (tx) => {
        await tx
          .deleteFrom('notifications')
          .where('created_at', '<', cutoff)
          .execute()
      })
    }
  })
}
