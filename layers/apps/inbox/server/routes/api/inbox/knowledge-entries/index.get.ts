// GET /api/inbox/knowledge-entries[?status=active|archived]
// List knowledge-base entries (read-tier: inbox.access). RLS scopes to the org.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const raw = getQuery(event).status
  const status = raw === 'active' || raw === 'archived' ? raw : undefined
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx) => {
    const entries = await inboxListKnowledgeEntries(tx, { status })
    return { entries: entries.map(inboxKnowledgeToDto) }
  })
})
