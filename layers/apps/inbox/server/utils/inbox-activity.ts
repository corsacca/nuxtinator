// Audit-trail writer for conversation lifecycle/triage events. Rows land in
// core's activity_logs keyed by (table_name='inbox_conversations', record_id).
// Passing the tenant tx as executor stamps org_id via the column DEFAULT in
// multi mode (activity_logs has no RLS — read isolation filters by record_id,
// which a caller resolves through the RLS-scoped conversation first). logEvent
// never throws, so a logging failure won't break the mutation.
import type { Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import { logEvent } from '#core/server/utils/activity-logger'

type Tx = Transaction<Database>

// Stable event-type vocabulary for the conversation timeline.
export const INBOX_ACTIVITY = 'inbox_conversations' as const

export async function inboxLogConversationEvent(
  tx: Tx,
  conversationId: string,
  eventType: string,
  message: string,
  opts?: { userId?: string, extra?: Record<string, unknown> }
): Promise<void> {
  await logEvent({
    eventType,
    tableName: INBOX_ACTIVITY,
    recordId: conversationId,
    userId: opts?.userId,
    metadata: { message, ...(opts?.extra ?? {}) }
  }, tx)
}
