// GET /api/gmail/accounts — the caller's connected accounts.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    const rows = await gmailListAccounts(tx, ctx.userId)
    return { accounts: rows.map(gmailAccountView) }
  })
})
