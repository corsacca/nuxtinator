// POST /api/messages/conversations/:id/read
// Mark the caller's read pointer for this conversation as "now". Idempotent.

import { sql } from 'kysely'
import { withOrgContext } from '#tenant/server'
import { requireConversationAccess } from '../../../../../utils/conversation-access'

export default defineEventHandler(async (event) => {
  return await withOrgContext(event, { appId: 'messages' }, async (tx, ctx) => {
    const conversationId = getRouterParam(event, 'id')!
    const conv = await requireConversationAccess(tx, ctx.userId, conversationId)

    await tx
      .insertInto('messages_conversation_reads')
      .values({
        user_id: ctx.userId,
        conversation_id: conv.id,
        last_read_at: sql<Date>`now()`
      })
      .onConflict(oc => oc
        .columns(['user_id', 'conversation_id'])
        .doUpdateSet({ last_read_at: sql<Date>`now()` })
      )
      .execute()

    // Also clear unread notifications for this conversation.
    await tx
      .updateTable('messages_notifications')
      .set({ read_at: sql<Date>`now()` })
      .where('user_id', '=', ctx.userId)
      .where('conversation_id', '=', conv.id)
      .where('read_at', 'is', null)
      .execute()

    return { ok: true }
  })
})
