// POST /api/inbox/conversations/:id/messages
// Body: { body } (HTML). Queues a reply on the conversation: the message row
// lands with status 'queued' and the send sweep delivers it. Replying
// auto-assigns an unassigned conversation to the sender, flips the
// conversation to 'pending' (waiting on the contact), and clears the
// needs-review flag (a reply resolves any pending held-message review).

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({
  body: z.string().min(1).max(500_000)
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx, ctx) => {
    const conversation = await inboxGetConversation(tx, id)
    if (!conversation) {
      throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    }
    if (conversation.status === 'spam') {
      throw createError({ statusCode: 400, statusMessage: 'Cannot reply to a spam conversation' })
    }

    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }

    const html = inboxSanitizeEmailHtml(parsed.data.body)
    const text = html.replace(/<[^>]*>/g, '')

    const message = await inboxCreateMessage(tx, {
      conversationId: conversation.id,
      direction: 'outbound',
      status: 'queued',
      senderUserId: ctx.userId,
      subject: conversation.subject ? `Re: ${conversation.subject.replace(/^Re:\s*/i, '')}` : null,
      bodyHtml: html,
      bodyText: text
    })

    await inboxAssignIfUnassigned(tx, conversation.id, ctx.userId)
    await inboxUpdateConversationStatus(tx, conversation.id, 'pending')
    await inboxSetNeedsReview(tx, conversation.id, false)
    await inboxTouchLastMessage(tx, conversation.id, message.created_at, 'outbound')
    await inboxLogConversationEvent(tx, conversation.id, 'inbox_reply_queued', 'Reply queued', {
      userId: ctx.userId,
      extra: { messageId: message.id, direction: 'outbound' }
    })

    return { id: message.id, status: message.status }
  })
})
