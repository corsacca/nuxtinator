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
import type { Database } from '~/server/database/schema'
import { sendDigestEmail, type DigestChannelEntry, type DigestThreadEntry } from '../utils/messages-email'

interface PerUserAccumulator {
  channels: DigestChannelEntry[]
  threads: DigestThreadEntry[]
  notificationIds: string[]
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
  for (const r of threadRows) {
    const key = r.item_id ?? ''
    if (!key) continue
    acc.notificationIds.push(r.notification_id)
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
  for (const t of threadMap.values()) acc.threads.push(t)
}

async function markEmailed(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return
  // Mark in a fresh autocommit query — the per-user txn has already closed
  // and we only want to record that the email was queued.
  await db
    .updateTable('messages_notifications')
    .set({ emailed_at: sql<Date>`now()` })
    .where('id', 'in', notificationIds)
    .execute()
}

async function runOnce(): Promise<void> {
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
            acc = { channels: [], threads: [], notificationIds: [] }
            perUser.set(m.user_id, acc)
          }
          await scanForUser(tx, m.user_id, acc)
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
          const acc: PerUserAccumulator = { channels: [], threads: [], notificationIds: [] }
          await scanForUser(tx, uid, acc)
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
    await markEmailed(acc.notificationIds)
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
