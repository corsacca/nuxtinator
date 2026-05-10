// POST /api/messages/comments/:id/resolve
// Toggle the resolved state. Body: { resolved: boolean }.
// Anyone with conversation access can resolve.

import { z } from 'zod'
import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'
import { requireConversationAccess } from '../../../../../utils/conversation-access'

const Body = z.object({
  resolved: z.boolean()
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'messages' }, 'messages.write', async (tx, ctx) => {
    const commentId = getRouterParam(event, 'id')!
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
    }

    const comment = await tx
      .selectFrom('messages_comments')
      .innerJoin('messages_items', 'messages_items.id', 'messages_comments.item_id')
      .select([
        'messages_comments.id as id',
        'messages_comments.deleted_at as deleted_at',
        'messages_items.conversation_id as conversation_id'
      ])
      .where('messages_comments.id', '=', commentId)
      .executeTakeFirst()
    if (!comment || comment.deleted_at) {
      throw createError({ statusCode: 404, statusMessage: 'Comment not found.' })
    }
    await requireConversationAccess(tx, ctx.userId, comment.conversation_id)

    if (parsed.data.resolved) {
      await tx
        .updateTable('messages_comments')
        .set({
          resolved_at: sql<Date>`now()`,
          resolved_by: ctx.userId
        })
        .where('id', '=', commentId)
        .execute()
    } else {
      await tx
        .updateTable('messages_comments')
        .set({
          resolved_at: null,
          resolved_by: null
        })
        .where('id', '=', commentId)
        .execute()
    }

    return { ok: true, resolved: parsed.data.resolved }
  })
})
