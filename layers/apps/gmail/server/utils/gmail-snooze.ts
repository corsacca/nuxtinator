// Snooze is local state only: a snoozed thread leaves the inbox view until
// `wake_at`, a reply, or a manual unsnooze brings it back to the top. Gmail
// itself is never told.
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'

type Db = Kysely<Database> | Transaction<Database>

export type GmailWakeReason = 'timer' | 'reply' | 'manual'

export async function gmailSnoozeThread(tx: Transaction<Database>, userId: string, threadId: string, wakeAt: Date): Promise<void> {
  await tx
    .updateTable('gmail_snoozes')
    .set({ woke_at: new Date(), wake_reason: 'replaced' })
    .where('thread_id', '=', threadId)
    .where('woke_at', 'is', null)
    .execute()
  await tx
    .insertInto('gmail_snoozes')
    .values({ thread_id: threadId, user_id: userId, wake_at: wakeAt, created_at: new Date() })
    .execute()
  await tx
    .updateTable('gmail_threads')
    .set({ snoozed_until: wakeAt, woken_at: null, updated_at: new Date() })
    .where('id', '=', threadId)
    .where('user_id', '=', userId)
    .execute()
}

// Wakes the given threads: closes their open snooze rows, clears the snooze,
// and bumps sort_at so they surface at the top of the inbox.
export async function gmailWakeThreads(db: Db, threadIds: string[], reason: GmailWakeReason): Promise<number> {
  if (!threadIds.length) return 0
  await db
    .updateTable('gmail_snoozes')
    .set({ woke_at: new Date(), wake_reason: reason })
    .where('thread_id', 'in', threadIds)
    .where('woke_at', 'is', null)
    .execute()
  const res = await db
    .updateTable('gmail_threads')
    .set({ snoozed_until: null, woken_at: sql`now()`, sort_at: sql`now()`, updated_at: new Date() })
    .where('id', 'in', threadIds)
    .where('snoozed_until', 'is not', null)
    .executeTakeFirst()
  return Number(res.numUpdatedRows)
}

export async function gmailRunWakeSweep(db: Db): Promise<number> {
  const due = await db
    .selectFrom('gmail_snoozes')
    .select('thread_id')
    .where('woke_at', 'is', null)
    .where('wake_at', '<=', sql<Date>`now()`)
    .execute()
  const ids = [...new Set(due.map(r => r.thread_id))]
  return await gmailWakeThreads(db, ids, 'timer')
}
