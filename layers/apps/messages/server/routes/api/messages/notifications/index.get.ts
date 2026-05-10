// GET /api/messages/notifications?cursor=&limit=&unread_only=
// Returns the caller's notification feed (mentions / DMs / comment / reply).

import { withOrgContext } from '#tenant/server'

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 100

export default defineEventHandler(async (event) => {
  return await withOrgContext(event, { appId: 'messages' }, async (tx, ctx) => {
    const q = getQuery(event)
    const cursor = typeof q.cursor === 'string' ? q.cursor : null
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.limit) || DEFAULT_LIMIT))
    const unreadOnly = q.unread_only === 'true' || q.unread_only === '1'

    let qb = tx
      .selectFrom('messages_notifications as n')
      .leftJoin('users as actor', 'actor.id', 'n.actor_id')
      .leftJoin('messages_items as i', 'i.id', 'n.item_id')
      .leftJoin('messages_comments as c', 'c.id', 'n.comment_id')
      .leftJoin('messages_conversations as conv', 'conv.id', 'n.conversation_id')
      .select([
        'n.id',
        'n.kind',
        'n.item_id',
        'n.comment_id',
        'n.conversation_id',
        'n.created_at',
        'n.read_at',
        'actor.id as actor_id',
        'actor.display_name as actor_name',
        'actor.avatar as actor_avatar',
        'conv.kind as conv_kind',
        'conv.name as conv_name',
        'i.body_md as item_text',
        'c.body_md as comment_text'
      ])
      .where('n.user_id', '=', ctx.userId)
      .orderBy('n.created_at', 'desc')
      .limit(limit + 1)

    if (cursor) qb = qb.where('n.created_at', '<', cursor)
    if (unreadOnly) qb = qb.where('n.read_at', 'is', null)

    const rows = await qb.execute()
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    const unreadCountRow = await tx
      .selectFrom('messages_notifications')
      .select(eb => eb.fn.countAll<string>().as('c'))
      .where('user_id', '=', ctx.userId)
      .where('read_at', 'is', null)
      .executeTakeFirst()

    return {
      notifications: page.map(r => ({
        id: r.id,
        kind: r.kind,
        item_id: r.item_id,
        comment_id: r.comment_id,
        conversation_id: r.conversation_id,
        conversation_kind: r.conv_kind,
        conversation_name: r.conv_name,
        created_at: r.created_at,
        read_at: r.read_at,
        excerpt: (r.comment_text ?? r.item_text ?? '').slice(0, 240),
        actor: r.actor_id
          ? { id: r.actor_id, display_name: r.actor_name, avatar: r.actor_avatar }
          : null
      })),
      next_cursor: hasMore ? (page[page.length - 1]!.created_at as Date).toISOString() : null,
      unread_count: Number(unreadCountRow?.c ?? 0)
    }
  })
})
