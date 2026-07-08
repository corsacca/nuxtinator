// PATCH /api/inbox/conversations/:id/comments/:commentId { body }
// Edit a note. Own-only unless the caller is an org admin (the moderator bar);
// system notes are never editable. Sets the edited marker.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({ body: z.string().min(1).max(10_000) })

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const commentId = getRouterParam(event, 'commentId')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx, ctx) => {
    const conversation = await inboxGetConversation(tx, id)
    if (!conversation) {
      throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    }
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
    }
    return await inboxUpdateComment(tx, commentId, ctx.userId, parsed.data.body, ctx.roles.includes('admin'))
  })
})
