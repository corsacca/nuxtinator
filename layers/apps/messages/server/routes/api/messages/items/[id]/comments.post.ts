// POST /api/messages/items/:id/comments
// Body: { body_md, anchor?, parent_comment_id? }

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { requireConversationAccess } from '../../../../../utils/conversation-access'
import { extractMentions } from '../../../../../utils/markdown-mentions'
import { fanoutMentions } from '../../../../../utils/mention-fanout'
import { getDmMemberIds } from '../../../../../utils/dm-members'
import { createNotifications } from '../../../../../utils/notification-creator'
import { sendMentionEmail } from '../../../../../utils/messages-email'

const Anchor = z.object({
  quote: z.string().min(1).max(2000),
  prefix: z.string().max(200),
  suffix: z.string().max(200),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative()
})

const Body = z.object({
  body_md: z.string().min(1).max(32 * 1024),
  anchor: Anchor.optional(),
  parent_comment_id: z.string().uuid().nullable().optional()
})

export default defineEventHandler(async (event) => {
  let mentionEmailQueue: Array<{ recipientId: string, actorId: string, conversationId: string, itemId: string, commentId: string, bodyMd: string }> = []

  const result = await withOrgPermission(event, { appId: 'messages' }, 'messages.write', async (tx, ctx) => {
    const itemId = getRouterParam(event, 'id')!

    const item = await tx
      .selectFrom('messages_items')
      .select(['id', 'conversation_id', 'author_id', 'deleted_at', 'kind'])
      .where('id', '=', itemId)
      .executeTakeFirst()
    if (!item || item.deleted_at) {
      throw createError({ statusCode: 404, statusMessage: 'Item not found.' })
    }
    const conv = await requireConversationAccess(tx, ctx.userId, item.conversation_id)

    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    const bodyMd = parsed.data.body_md

    // Validate parent depth — replies can only target a top-level comment.
    let parentId: string | null = null
    if (parsed.data.parent_comment_id) {
      const parent = await tx
        .selectFrom('messages_comments')
        .select(['id', 'parent_comment_id', 'item_id'])
        .where('id', '=', parsed.data.parent_comment_id)
        .executeTakeFirst()
      if (!parent || parent.item_id !== itemId) {
        throw createError({ statusCode: 400, statusMessage: 'Parent comment not found on this item.' })
      }
      if (parent.parent_comment_id !== null) {
        throw createError({ statusCode: 400, statusMessage: 'Replies can only target top-level comments.' })
      }
      parentId = parent.id
    }

    // Anchors are only valid on top-level comments on markdown items.
    let anchor = parsed.data.anchor ?? null
    if (anchor && parentId) anchor = null
    if (anchor && item.kind !== 'markdown') anchor = null

    const inserted = await tx
      .insertInto('messages_comments')
      .values({
        item_id: itemId,
        author_id: ctx.userId,
        parent_comment_id: parentId,
        body_md: bodyMd,
        anchor: anchor as Record<string, unknown> | null
      })
      .returning(['id', 'created_at'])
      .executeTakeFirstOrThrow()

    // Mention fan-out.
    const mentions = extractMentions(bodyMd)
    const dmMemberIds = conv.kind === 'dm' ? await getDmMemberIds(tx, conv.id) : null
    const mentionResult = await fanoutMentions(tx, mentions, {
      orgId: ctx.orgId,
      authorId: ctx.userId,
      conversationId: conv.id,
      commentId: inserted.id,
      dmMemberIds
    })
    const mentionedSet = new Set(mentionResult.notified)

    // Queue per-event mention emails for after the txn commits.
    for (const uid of mentionResult.notified) {
      mentionEmailQueue.push({
        recipientId: uid,
        actorId: ctx.userId,
        conversationId: conv.id,
        itemId,
        commentId: inserted.id,
        bodyMd
      })
    }

    // Comment-thread auto-subscribe.
    const priorCommenterRows = await tx
      .selectFrom('messages_comments')
      .select('author_id')
      .where('item_id', '=', itemId)
      .where('id', '!=', inserted.id)
      .execute()

    const recipients = new Set<string>()
    if (item.author_id !== ctx.userId) recipients.add(item.author_id)
    for (const r of priorCommenterRows) {
      if (r.author_id !== ctx.userId) recipients.add(r.author_id)
    }
    for (const id of mentionedSet) recipients.delete(id)

    if (recipients.size > 0) {
      await createNotifications(
        tx,
        [...recipients].map(uid => ({
          user_id: uid,
          kind: parentId ? ('reply' as const) : ('comment' as const),
          item_id: itemId,
          comment_id: inserted.id,
          conversation_id: conv.id,
          actor_id: ctx.userId
        })),
        { perEventEmail: false }
      )
    }

    return { id: inserted.id, created_at: inserted.created_at }
  })

  for (const m of mentionEmailQueue) {
    await sendMentionEmail(m)
  }

  return result
})
