// DELETE /api/inbox/canned-responses/:id → { success }. inbox.send-gated.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx) => {
    const ok = await inboxDeleteCanned(tx, id)
    if (!ok) {
      throw createError({ statusCode: 404, statusMessage: 'Canned response not found' })
    }
    return { success: true }
  })
})
