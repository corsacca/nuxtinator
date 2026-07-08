// GET /api/inbox/conversations/tag-counts → { counts: Record<slug, number> }.
// Cross-status folder counts (spam excluded) — drives the rail tag badges.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx) => {
    return { counts: await inboxTagCounts(tx) }
  })
})
