// PATCH /api/messages/comments/:id
// Author-only edit of comment body_md.

import { z } from 'zod'
import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'
import { extractMentions } from '../../../../utils/markdown-mentions'
import { fanoutMentions } from '../../../../utils/mention-fanout'
import { getDmMemberIds } from '../../../../utils/dm-members'

const Body = z.object({
  body_md: z.string().min(1).max(32 * 1024)
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'messages' }, 'messages.write', async (tx, ctx) => {
    const commentId = getRouterParam(event, 'id')!

    const comment = await tx
      .selectFrom('messages_comments')
      .innerJoin('messages_items', 'messages_items.id', 'messages_comments.item_id')
      .select([
        'messages_comments.id as id',
        'messages_comments.author_id as author_id',
        'messages_comments.deleted_at as deleted_at',
        'messages_comments.item_id as item_id',
        'messages_items.conversation_id as conversation_id'
      ])
      .where('messages_comments.id', '=', commentId)
      .executeTakeFirst()
    if (!comment || comment.deleted_at) {
      throw createError({ statusCode: 404, statusMessage: 'Comment not found.' })
    }
    if (comment.author_id !== ctx.userId) {
      throw createError({ statusCode: 403, statusMessage: 'Only the author can edit.' })
    }

    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    const bodyMd = parsed.data.body_md

    await tx
      .updateTable('messages_comments')
      .set({
        body_md: bodyMd,
        edited_at: sql<Date>`now()`
      })
      .where('id', '=', commentId)
      .execute()

    const newMentions = extractMentions(bodyMd)
    if (newMentions.length > 0) {
      const existing = await tx
        .selectFrom('messages_mentions')
        .select('mentioned_user_id')
        .where('comment_id', '=', commentId)
        .execute()
      const already = new Set(existing.map(r => r.mentioned_user_id))
      const fresh = newMentions.filter(m => !already.has(m.id))
      if (fresh.length > 0) {
        const conv = await tx
          .selectFrom('messages_conversations')
          .select('kind')
          .where('id', '=', comment.conversation_id)
          .executeTakeFirstOrThrow()
        const dmMemberIds = conv.kind === 'dm' ? await getDmMemberIds(tx, comment.conversation_id) : null
        await fanoutMentions(tx, fresh, {
          orgId: ctx.orgId,
          authorId: ctx.userId,
          conversationId: comment.conversation_id,
          commentId,
          dmMemberIds
        })
      }
    }

    return { ok: true }
  })
})
