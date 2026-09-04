// POST /api/gmail/accounts/:id/sync — an immediate full pass (with
// reconciliation) for the "Sync now" button.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const accountId = await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    const row = await gmailGetAccount(tx, ctx.userId, id)
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Account not found' })
    return row.id
  })
  try {
    const outcome = await gmailSyncNow(accountId)
    return { outcome }
  } catch (err) {
    throw createError({ statusCode: 502, statusMessage: `Sync failed: ${(err as Error)?.message ?? 'unknown error'}` })
  }
})
