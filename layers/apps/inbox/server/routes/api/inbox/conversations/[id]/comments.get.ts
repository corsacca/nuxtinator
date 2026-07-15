// GET /api/inbox/conversations/:id/comments?limit=&before=
// Newest-first, keyset-paginated internal notes. inbox.access-gated; the
// conversation lookup (RLS-scoped) is the org isolation boundary.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().optional()
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx) => {
    const conversation = await inboxGetConversation(tx, id)
    if (!conversation) {
      throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    }
    const parsed = Query.safeParse(getQuery(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid query' })
    }
    return await inboxListComments(tx, id, { limit: parsed.data.limit, before: parsed.data.before })
  })
})
