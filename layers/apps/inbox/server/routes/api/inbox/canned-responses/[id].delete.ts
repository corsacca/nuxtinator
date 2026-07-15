// DELETE /api/inbox/canned-responses/:id → { success }. inbox.send-gated.
import { withOrgPermission } from '#tenant/server'
import { logEvent } from '#core/server/utils/activity-logger'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx, ctx) => {
    // Read before delete — the audit row names what was removed.
    const existing = await inboxGetCanned(tx, id)
    const ok = existing ? await inboxDeleteCanned(tx, id) : false
    if (!ok) {
      throw createError({ statusCode: 404, statusMessage: 'Canned response not found' })
    }
    await logEvent({
      eventType: 'inbox_canned_deleted',
      userId: ctx.userId,
      metadata: { message: 'Canned response deleted', cannedId: id, title: existing!.title }
    }, tx)
    return { success: true }
  })
})
