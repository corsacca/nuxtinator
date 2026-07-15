// GET /api/inbox/conversations/counts
// Query: status (badge scoping), scope (which rail tab is active). Returns
// the rail + status-strip badge numbers.

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Query = z.object({
  status: z.enum(['open', 'pending', 'closed', 'spam']).optional(),
  scope: z.enum(['all', 'unassigned', 'mine', 'held']).optional()
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx, ctx) => {
    const parsed = Query.safeParse(getQuery(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid query', data: parsed.error.flatten() })
    }
    return await inboxConversationCounts(tx, {
      status: parsed.data.status,
      scope: parsed.data.scope,
      mine: ctx.userId
    })
  })
})
