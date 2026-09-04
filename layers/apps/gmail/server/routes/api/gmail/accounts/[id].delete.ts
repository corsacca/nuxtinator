// DELETE /api/gmail/accounts/:id — disconnect; every mirrored row cascades.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    const ok = await gmailDeleteAccount(tx, ctx.userId, id)
    if (!ok) throw createError({ statusCode: 404, statusMessage: 'Account not found' })
    return { ok: true }
  })
})
