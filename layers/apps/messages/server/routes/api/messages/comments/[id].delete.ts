// DELETE /api/messages/comments/:id
// Soft delete. Author or operator admin only.

import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'messages' }, 'messages.write', async (tx, ctx) => {
    const commentId = getRouterParam(event, 'id')!

    const comment = await tx
      .selectFrom('messages_comments')
      .select(['id', 'author_id', 'deleted_at'])
      .where('id', '=', commentId)
      .executeTakeFirst()
    if (!comment || comment.deleted_at) {
      throw createError({ statusCode: 404, statusMessage: 'Comment not found.' })
    }

    const isAdmin = ctx.role === 'admin' || ctx.perms.has('messages.channel.archive')
    if (comment.author_id !== ctx.userId && !isAdmin) {
      throw createError({ statusCode: 403, statusMessage: 'Only the author or an admin can delete.' })
    }

    await tx
      .updateTable('messages_comments')
      .set({ deleted_at: sql<Date>`now()` })
      .where('id', '=', commentId)
      .execute()

    return { ok: true }
  })
})
