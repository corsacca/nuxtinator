// POST /api/messages/reactions
// Body: { target_kind: 'item' | 'comment', target_id: string, emoji: string }
// Adds a reaction. Idempotent (unique constraint).

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { requireConversationAccess } from '../../../../utils/conversation-access'

const Body = z.object({
  target_kind: z.enum(['item', 'comment']),
  target_id: z.string().uuid(),
  emoji: z.string().min(1).max(64)
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'messages' }, 'messages.write', async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }

    // Resolve the conversation the target lives in for access check.
    let conversationId: string | null = null
    if (parsed.data.target_kind === 'item') {
      const row = await tx
        .selectFrom('messages_items')
        .select(['conversation_id', 'deleted_at'])
        .where('id', '=', parsed.data.target_id)
        .executeTakeFirst()
      if (!row || row.deleted_at) throw createError({ statusCode: 404, statusMessage: 'Item not found.' })
      conversationId = row.conversation_id
    } else {
      const row = await tx
        .selectFrom('messages_comments')
        .innerJoin('messages_items', 'messages_items.id', 'messages_comments.item_id')
        .select([
          'messages_comments.deleted_at as deleted_at',
          'messages_items.conversation_id as conversation_id'
        ])
        .where('messages_comments.id', '=', parsed.data.target_id)
        .executeTakeFirst()
      if (!row || row.deleted_at) throw createError({ statusCode: 404, statusMessage: 'Comment not found.' })
      conversationId = row.conversation_id
    }
    await requireConversationAccess(tx, ctx.userId, conversationId!)

    await tx
      .insertInto('messages_reactions')
      .values({
        target_kind: parsed.data.target_kind,
        target_id: parsed.data.target_id,
        user_id: ctx.userId,
        emoji: parsed.data.emoji
      })
      .onConflict(oc => oc.doNothing())
      .execute()

    return { ok: true }
  })
})
