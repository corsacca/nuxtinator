// Authorization helpers for conversation access. RLS already gates rows by
// org; these helpers add the per-conversation membership check that's
// specific to messages: channels are visible to all org members; DMs are
// only visible to their participants.

import type { Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import type { ConversationKind } from '../database/schema.d'

export interface ConversationLite {
  id: string
  kind: ConversationKind
}

export async function loadConversation(
  tx: Transaction<Database>,
  conversationId: string
): Promise<ConversationLite | null> {
  const row = await tx
    .selectFrom('messages_conversations')
    .select(['id', 'kind'])
    .where('id', '=', conversationId)
    .executeTakeFirst()
  return row ?? null
}

export async function userCanAccessConversation(
  tx: Transaction<Database>,
  userId: string,
  conv: ConversationLite
): Promise<boolean> {
  if (conv.kind === 'channel') return true // all org members can see all channels
  // DM: must be a participant
  const member = await tx
    .selectFrom('messages_conversation_members')
    .select('user_id')
    .where('conversation_id', '=', conv.id)
    .where('user_id', '=', userId)
    .executeTakeFirst()
  return !!member
}

export async function requireConversationAccess(
  tx: Transaction<Database>,
  userId: string,
  conversationId: string
): Promise<ConversationLite> {
  const conv = await loadConversation(tx, conversationId)
  if (!conv) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found.' })
  }
  if (!(await userCanAccessConversation(tx, userId, conv))) {
    throw createError({ statusCode: 403, statusMessage: 'You don\'t have access to this conversation.' })
  }
  return conv
}
