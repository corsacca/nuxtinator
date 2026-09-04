// GET /api/gmail/threads/counts — rail badges.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    return { counts: await gmailThreadCounts(tx, ctx.userId) }
  })
})
