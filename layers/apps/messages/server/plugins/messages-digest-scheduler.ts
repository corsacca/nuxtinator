// Daily digest scheduler for the messages layer.
//
// Cron: `0 8 * * *` (server tz). For every user with at least one digest-eligible
// signal, builds one digest email and marks the involved notification rows
// `emailed_at = NOW()` so they don't appear in subsequent digests.
//
// Per-event emails (DMs + @-mentions) are NOT in the digest — those rows are
// stamped with `emailed_at = NOW()` at creation time, so the digest scan
// filters them out.
//
// Detection of multi-tenant mode is via `runtimeConfig.tenancyMigrationPaths`
// — set by the tenancy layer's `tenant-migrations` Nuxt module when present.
// In multi mode, the scheduler iterates `(user_id, org_id)` pairs from
// `memberships` and runs each scan inside a transaction with the
// `app.current_org` GUC set, so RLS lets the messages_* tables read.

import { Cron } from 'croner'
import { sql, type Transaction } from 'kysely'
import { db } from '#core/server/utils/database'
import type { Database } from '#core/server/database/schema'
import { sendDigestEmail, type DigestChannelEntry, type DigestThreadEntry } from '../utils/messages-email'

interface PerUserAccumulator {
  channels: DigestChannelEntry[]
  threads: DigestThreadEntry[]
  // Notification IDs grouped by the org GUC needed to UPDATE them under RLS.
  // In single-tenant mode (no tenancy layer) the key is `null` and no GUC is
  // set; in multi-tenant mode each org's IDs go under its own key so the
  // post-send markEmailed step can re-open a tx with the right GUC.
  notificationIdsByOrg: Map<string | null, string[]>
}

function isTenancyMode(): boolean {
  try {
    const cfg = useRuntimeConfig()
    const paths = (cfg.tenancyMigrationPaths as string[] | undefined) ?? []
    return paths.length > 0
  } catch {
    return false
  }
}

async function scanForUser(
  tx: Transaction<Database>,
  userId: string,
  orgId: string | null,
  acc: PerUserAccumulator
): Promise<void> {
  // Subscribed channels with items posted since the user's last_read_at.
  const channelRows = await tx
    .selectFrom('messages_channel_subscriptions as sub')
    .innerJoin('messages_conversations as c', 'c.id', 'sub.channel_id')
    .leftJoin('messages_conversation_reads as r', join =>
      join.onRef('r.conversation_id', '=', 'c.id').on('r.user_id', '=', userId))
    .select([
      'c.id',
      'c.name',
      eb => eb.fn.coalesce('r.last_read_at', sql<Date>`'epoch'::timestamptz`).as('last_read_at')
    ])
    .where('sub.user_id', '=', userId)
    .where('c.archived_at', 'is', null)
    .where('c.kind', '=', 'channel')
    .execute()

  for (const row of channelRows) {
    const countRow = await tx
      .selectFrom('messages_items')
      .select(eb => eb.fn.countAll<string>().as('c'))
      .where('conversation_id', '=', row.id)
      .where('created_at', '>', row.last_read_at as Date)
      .where('deleted_at', 'is', null)
      .where('author_id', '!=', userId)
      .executeTakeFirst()
    const n = Number(countRow?.c ?? 0)
    if (n > 0) {
      acc.channels.push({
        conversationId: row.id,
        conversationName: row.name ?? '',
        unreadCount: n
      })
    }
  }

  // Comment / reply notification rows that haven't been emailed yet.
  const threadRows = await tx
    .selectFrom('messages_notifications as n')
    .innerJoin('messages_items as i', 'i.id', 'n.item_id')
    .innerJoin('messages_conversations as c', 'c.id', 'n.conversation_id')
    .select([
      'n.id as notification_id',
      'n.item_id',
      'i.body_md as item_body',
      'c.id as conversation_id',
      'c.name as conversation_name'
    ])
    .where('n.user_id', '=', userId)
    .where('n.kind', 'in', ['comment', 'reply'])
    .where('n.emailed_at', 'is', null)
    .where('n.read_at', 'is', null)
    .execute()

  // Group by item — one digest entry per thread, count comments per item.
  const threadMap = new Map<string, DigestThreadEntry>()
  const idsForOrg = acc.notificationIdsByOrg.get(orgId) ?? []
  for (const r of threadRows) {
    const key = r.item_id ?? ''
    if (!key) continue
    idsForOrg.push(r.notification_id)
    const existing = threadMap.get(key)
    if (existing) {
      existing.count++
      continue
    }
    threadMap.set(key, {
      itemId: key,
      conversationId: r.conversation_id ?? '',
      conversationName: r.conversation_name,
      excerpt: (r.item_body ?? '').slice(0, 160),
      count: 1
    })
  }
  if (idsForOrg.length > 0) acc.notificationIdsByOrg.set(orgId, idsForOrg)
  for (const t of threadMap.values()) acc.threads.push(t)
}

// Mark notification rows as emailed. In multi-tenant mode the rows live
// behind an RLS policy keyed on `app.current_org`, so the UPDATE must run
// inside a transaction with the GUC set to the same org the rows belong to —
// otherwise the policy resolves `org_id = NULL` and matches zero rows.
async function markEmailed(idsByOrg: Map<string | null, string[]>): Promise<void> {
  for (const [orgId, ids] of idsByOrg.entries()) {
    if (ids.length === 0) continue
    await db.transaction().execute(async (tx) => {
      if (orgId) {
        await sql`select set_config('app.current_org', ${orgId}, true)`.execute(tx)
      }
      await tx
        .updateTable('messages_notifications')
        .set({ emailed_at: sql<Date>`now()` })
        .where('id', 'in', ids)
        .execute()
    })
  }
}

// Stable 64-bit key for `pg_try_advisory_lock`. Picked once and committed —
// don't change without coordinating across deployments, since two different
// keys means two different locks and the no-duplicate-digests guarantee
// breaks during a rolling deploy.
const DIGEST_LOCK_KEY = '7242319037128942711'

async function runOnce(): Promise<void> {
  // Cross-replica gate: only one process per cluster runs the digest. Other
  // replicas see `false` and bail. The lock is session-scoped, so any process
  // crash releases it automatically — no stuck-lock recovery needed.
  const lockRow = await sql<{ got: boolean }>`
    select pg_try_advisory_lock(${sql.raw(DIGEST_LOCK_KEY)}::bigint) as got
  `.execute(db)
  if (!lockRow.rows[0]?.got) {
    console.log('[messages-digest] another replica holds the digest lock — skipping')
    return
  }
  try {
    await runOnceLocked()
  } finally {
    await sql`select pg_advisory_unlock(${sql.raw(DIGEST_LOCK_KEY)}::bigint)`.execute(db)
  }
}

async function runOnceLocked(): Promise<void> {
  console.log('[messages-digest] scan starting')
  const perUser = new Map<string, PerUserAccumulator>()

  if (isTenancyMode()) {
    // Multi-tenant: iterate (user, org) pairs and run a per-pair tx with
    // the GUC set so RLS lets the messages_* queries through.
    const memberships = await db
      .selectFrom('memberships')
      .select(['user_id', 'org_id'])
      .execute()

    for (const m of memberships) {
      try {
        await db.transaction().execute(async (tx) => {
          await sql`select set_config('app.current_org', ${m.org_id}, true)`.execute(tx)
          let acc = perUser.get(m.user_id)
          if (!acc) {
            acc = { channels: [], threads: [], notificationIdsByOrg: new Map() }
            perUser.set(m.user_id, acc)
          }
          await scanForUser(tx, m.user_id, m.org_id, acc)
        })
      } catch (err) {
        console.error('[messages-digest] scan failed for user', m.user_id, 'org', m.org_id, err)
      }
    }
  } else {
    // Single-tenant: every user with notifications or subscriptions in
    // messages_* may need a digest. Pull the candidate user-id set from
    // both signal sources.
    const candidateRows = await db
      .selectFrom('messages_channel_subscriptions')
      .select('user_id as id')
      .union(qb => qb
        .selectFrom('messages_notifications')
        .select('user_id as id')
        .where('emailed_at', 'is', null)
        .where('read_at', 'is', null)
        .where('kind', 'in', ['comment', 'reply']))
      .execute()
    const userIds = Array.from(new Set(candidateRows.map(r => r.id)))

    for (const uid of userIds) {
      try {
        await db.transaction().execute(async (tx) => {
          const acc: PerUserAccumulator = { channels: [], threads: [], notificationIdsByOrg: new Map() }
          await scanForUser(tx, uid, null, acc)
          if (acc.channels.length > 0 || acc.threads.length > 0) {
            perUser.set(uid, acc)
          }
        })
      } catch (err) {
        console.error('[messages-digest] scan failed for user', uid, err)
      }
    }
  }

  // Send one email per user.
  let sent = 0
  for (const [userId, acc] of perUser.entries()) {
    if (acc.channels.length === 0 && acc.threads.length === 0) continue
    await sendDigestEmail({ recipientId: userId, channels: acc.channels, threads: acc.threads })
    await markEmailed(acc.notificationIdsByOrg)
    sent++
  }
  console.log(`[messages-digest] scan complete — sent ${sent} digest(s) to ${perUser.size} candidate user(s)`)
}

export default defineNitroPlugin(() => {
  // Avoid running the cron in build / prepare / typecheck contexts.
  if (process.env.NUXT_PREPARE_BUILD || process.env.NITRO_PRESET === 'prepare') return

  const job = new Cron('0 8 * * *', { protect: true }, () => {
    void runOnce().catch(err => console.error('[messages-digest] runOnce error:', err))
  })
  console.log(`[messages-digest] scheduled at ${job.getPattern()} — next run ${job.nextRun()?.toISOString() ?? 'unknown'}`)
})
