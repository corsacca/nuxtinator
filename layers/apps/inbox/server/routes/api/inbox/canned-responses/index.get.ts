// GET /api/inbox/canned-responses → { items }
// Shared org-wide reply snippets, title-ascending. Read rides inbox.access
// (the composer picker and manager both live behind inbox.send, but listing is
// harmless at the lower tier and matches the tag palette's reach).
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx) => {
    const rows = await inboxListCanned(tx)
    return {
      items: rows.map(r => ({
        id: r.id,
        title: r.title,
        bodyHtml: r.body_html,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }))
    }
  })
})
