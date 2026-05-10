// Helpers for inserting notification rows into messages_notifications.
// Per-event email is handled in Phase 5; this layer only writes rows and
// flags them with `emailed_at = now` for kinds that don't go to digest
// (so the daily digest scan correctly skips them).

import type { Transaction } from 'kysely'
import { sql } from 'kysely'
import type { Database } from '#core/server/database/schema'
import type { NotificationKind } from '../database/schema.d'

export interface NotificationRow {
  user_id: string
  kind: NotificationKind
  item_id?: string | null
  comment_id?: string | null
  conversation_id?: string | null
  actor_id?: string | null
}

export async function createNotifications(
  tx: Transaction<Database>,
  rows: NotificationRow[],
  opts: { perEventEmail?: boolean } = {}
): Promise<void> {
  if (rows.length === 0) return

  // For DMs and mentions we mark `emailed_at = now` so the daily digest
  // scan ignores them — Phase 5 will (also) trigger a per-event email.
  const emailedAt = opts.perEventEmail ? sql<Date>`now()` : null

  await tx
    .insertInto('messages_notifications')
    .values(rows.map(r => ({
      user_id: r.user_id,
      kind: r.kind,
      item_id: r.item_id ?? null,
      comment_id: r.comment_id ?? null,
      conversation_id: r.conversation_id ?? null,
      actor_id: r.actor_id ?? null,
      emailed_at: emailedAt
    })))
    .execute()
}
