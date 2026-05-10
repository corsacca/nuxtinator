// DELETE /api/messages/items/:id
// Soft delete (sets deleted_at). Author or operator admin only.

import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'messages' }, 'messages.write', async (tx, ctx) => {
    const itemId = getRouterParam(event, 'id')!

    const item = await tx
      .selectFrom('messages_items')
      .select(['id', 'author_id', 'deleted_at'])
      .where('id', '=', itemId)
      .executeTakeFirst()
    if (!item || item.deleted_at) {
      throw createError({ statusCode: 404, statusMessage: 'Item not found.' })
    }

    const isAdmin = ctx.role === 'admin' || ctx.perms.has('messages.channel.archive')
    if (item.author_id !== ctx.userId && !isAdmin) {
      throw createError({ statusCode: 403, statusMessage: 'Only the author or an admin can delete.' })
    }

    await tx
      .updateTable('messages_items')
      .set({ deleted_at: sql<Date>`now()` })
      .where('id', '=', itemId)
      .execute()

    return { ok: true }
  })
})
