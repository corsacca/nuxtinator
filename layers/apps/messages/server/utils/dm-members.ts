// Helper to load DM participant user IDs.

import type { Transaction } from 'kysely'
import type { Database } from '~/server/database/schema'

export async function getDmMemberIds(
  tx: Transaction<Database>,
  conversationId: string
): Promise<Set<string>> {
  const rows = await tx
    .selectFrom('messages_conversation_members')
    .select('user_id')
    .where('conversation_id', '=', conversationId)
    .execute()
  return new Set(rows.map(r => r.user_id))
}
