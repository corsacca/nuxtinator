// GET /api/gmail/threads/:id — the thread with its messages (cached bodies
// included; uncached ones load through /api/gmail/messages/:id/body).
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    const detail = await gmailGetThread(tx, ctx.userId, id)
    if (!detail) throw createError({ statusCode: 404, statusMessage: 'Thread not found' })
    return detail
  })
})
