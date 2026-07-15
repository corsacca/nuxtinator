// DELETE /api/inbox/knowledge-entries/:entryId
// Delete a knowledge entry (write-tier: inbox.send).
import { withOrgPermission } from '#tenant/server'
import { logEvent } from '#core/server/utils/activity-logger'

export default defineEventHandler(async (event) => {
  const entryId = getRouterParam(event, 'entryId')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx, ctx) => {
    // Read before delete — the audit row names what was removed.
    const existing = await inboxGetKnowledgeEntry(tx, entryId)
    const ok = existing ? await inboxDeleteKnowledgeEntry(tx, entryId) : false
    if (!ok) throw createError({ statusCode: 404, statusMessage: 'Knowledge entry not found' })
    await logEvent({
      eventType: 'inbox_knowledge_deleted',
      userId: ctx.userId,
      metadata: { message: 'Knowledge entry deleted', entryId, question: existing!.question.slice(0, 200) }
    }, tx)
    return { ok: true }
  })
})
