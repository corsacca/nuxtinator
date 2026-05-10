// POST /api/messages/conversations/:id/unsubscribe
// Opt the caller out of digest notifications for this channel.

import { withOrgContext } from '#tenant/server'
import { requireConversationAccess } from '../../../../../utils/conversation-access'

export default defineEventHandler(async (event) => {
  return await withOrgContext(event, { appId: 'messages' }, async (tx, ctx) => {
    const conversationId = getRouterParam(event, 'id')!
    const conv = await requireConversationAccess(tx, ctx.userId, conversationId)

    if (conv.kind === 'channel') {
      await tx
        .deleteFrom('messages_channel_subscriptions')
        .where('channel_id', '=', conv.id)
        .where('user_id', '=', ctx.userId)
        .execute()
    }

    return { subscribed: false }
  })
})
