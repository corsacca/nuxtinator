// GET /api/gmail/labels — user labels across the caller's accounts.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    const accounts = await gmailListAccounts(tx, ctx.userId)
    const labels = await gmailListUserLabels(tx, accounts.map(a => a.id))
    return { labels }
  })
})
