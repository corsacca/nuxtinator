// DELETE /api/inbox/knowledge-entries/:entryId
// Delete a knowledge entry (write-tier: inbox.send).
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const entryId = getRouterParam(event, 'entryId')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx) => {
    const ok = await inboxDeleteKnowledgeEntry(tx, entryId)
    if (!ok) throw createError({ statusCode: 404, statusMessage: 'Knowledge entry not found' })
    return { ok: true }
  })
})
