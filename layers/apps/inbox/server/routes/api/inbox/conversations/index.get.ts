// GET /api/inbox/conversations
// Query: status, held, unassigned, mine, assigned_user_id, q, limit, offset.
// Returns { items, total } for the list pane.

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

// Query flags arrive as strings; z.coerce.boolean() treats ANY non-empty
// string as true (so ?held=false → true). Parse leniently: only 'true'/'1'
// are true, everything else false, absent stays undefined (no filter).
const boolParam = z
  .string()
  .optional()
  .transform(v => (v === undefined ? undefined : v === 'true' || v === '1'))

const Query = z.object({
  status: z.enum(['open', 'pending', 'closed', 'spam']).optional(),
  held: boolParam,
  unassigned: boolParam,
  mine: boolParam,
  assigned_user_id: z.string().uuid().optional(),
  tag: z.string().max(60).optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional()
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx, ctx) => {
    const parsed = Query.safeParse(getQuery(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid query', data: parsed.error.flatten() })
    }
    const q = parsed.data
    const filters = {
      status: q.status,
      held: q.held || undefined,
      unassigned: q.unassigned || undefined,
      mine: q.mine ? ctx.userId : undefined,
      assignedUserId: q.assigned_user_id,
      tag: q.tag,
      search: q.q,
      limit: q.limit,
      offset: q.offset
    }
    const [items, total] = await Promise.all([
      inboxListConversations(tx, filters),
      inboxCountConversations(tx, filters)
    ])
    return {
      items: items.map(c => ({
        id: c.id,
        subject: c.subject,
        status: c.status,
        assignedUserId: c.assigned_user_id,
        assigneeName: c.assignee_name,
        needsReview: c.needs_review,
        source: c.source,
        counterpartyName: c.counterparty_name,
        tags: c.tags,
        channelValue: c.channel_value,
        messageCount: c.message_count,
        snippet: c.last_message_snippet,
        lastMessageAt: c.last_message_at,
        lastMessageDirection: c.last_message_direction,
        createdAt: c.created_at
      })),
      total
    }
  })
})
