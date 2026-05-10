// PATCH /api/messages/items/:id
// Author-only edit of markdown body. Triggers re-anchor of comments.

import { z } from 'zod'
import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'
import { extractMentions } from '../../../../utils/markdown-mentions'
import { fanoutMentions } from '../../../../utils/mention-fanout'
import { getDmMemberIds } from '../../../../utils/dm-members'
import { rematchAnchors } from '../../../../utils/anchor-rematch'

const Body = z.object({
  body_md: z.string().min(1).max(64 * 1024)
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'messages' }, 'messages.write', async (tx, ctx) => {
    const itemId = getRouterParam(event, 'id')!

    const item = await tx
      .selectFrom('messages_items')
      .select(['id', 'author_id', 'kind', 'conversation_id', 'deleted_at'])
      .where('id', '=', itemId)
      .executeTakeFirst()
    if (!item || item.deleted_at) {
      throw createError({ statusCode: 404, statusMessage: 'Item not found.' })
    }
    if (item.author_id !== ctx.userId) {
      throw createError({ statusCode: 403, statusMessage: 'Only the author can edit.' })
    }
    if (item.kind !== 'markdown') {
      throw createError({ statusCode: 400, statusMessage: 'Only markdown items are editable.' })
    }

    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    const bodyMd = parsed.data.body_md

    await tx
      .updateTable('messages_items')
      .set({
        body_md: bodyMd,
        edited_at: sql<Date>`now()`
      })
      .where('id', '=', itemId)
      .execute()

    // Re-anchor comments against new body_md.
    await rematchAnchors(tx, itemId, bodyMd)

    // Fire mention notifications for IDs not previously mentioned in this item.
    const newMentions = extractMentions(bodyMd)
    if (newMentions.length > 0) {
      const existing = await tx
        .selectFrom('messages_mentions')
        .select('mentioned_user_id')
        .where('item_id', '=', itemId)
        .execute()
      const already = new Set(existing.map(r => r.mentioned_user_id))
      const fresh = newMentions.filter(m => !already.has(m.id))
      if (fresh.length > 0) {
        const conv = await tx
          .selectFrom('messages_conversations')
          .select('kind')
          .where('id', '=', item.conversation_id)
          .executeTakeFirstOrThrow()
        const dmMemberIds = conv.kind === 'dm' ? await getDmMemberIds(tx, item.conversation_id) : null
        await fanoutMentions(tx, fresh, {
          orgId: ctx.orgId,
          authorId: ctx.userId,
          conversationId: item.conversation_id,
          itemId,
          dmMemberIds
        })
      }
    }

    return { ok: true }
  })
})
