// DELETE /api/inbox/conversations/:id/comments/:commentId
// Own-only unless the caller is an org admin; system notes are never removable.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const commentId = getRouterParam(event, 'commentId')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx, ctx) => {
    const conversation = await inboxGetConversation(tx, id)
    if (!conversation) {
      throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    }
    await inboxDeleteComment(tx, commentId, ctx.userId, ctx.roles.includes('admin'))
    return { ok: true }
  })
})
