// POST /api/inbox/conversations/:id/comments { body, mentions? }
// Adds an internal note and notifies any @mentioned teammates (minus the
// author). Mentions are an explicit user-id list from the composer — never
// parsed out of the plain-text body.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({
  body: z.string().min(1).max(10_000),
  mentions: z.array(z.string().uuid()).max(50).optional()
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx, ctx) => {
    const conversation = await inboxGetConversation(tx, id)
    if (!conversation) {
      throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    }
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    const comment = await inboxAddComment(tx, id, ctx.userId, parsed.data.body)
    const mentions = [...new Set(parsed.data.mentions ?? [])].filter(uid => uid !== ctx.userId)
    if (mentions.length) {
      await inboxNotifyMention(tx, {
        conversationId: id,
        mentionedUserIds: mentions,
        actorName: comment.authorName,
        subject: conversation.subject
      })
    }
    return comment
  })
})
