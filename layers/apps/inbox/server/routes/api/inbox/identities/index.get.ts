// GET /api/inbox/identities → every org member with their alias/signature
// state, for the admin identities manager. Admin-gated (aliases are routable,
// so their management authority is admin, not just inbox.send).
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx, ctx) => {
    if (!ctx.roles.includes('admin')) {
      throw createError({ statusCode: 403, statusMessage: 'Only an admin can manage sending identities' })
    }
    const rows = await tx
      .selectFrom('inbox_identities')
      .select(['user_id', 'alias', 'signature'])
      .execute()
    return {
      identities: rows.map(r => ({
        userId: r.user_id,
        alias: r.alias,
        hasSignature: !!r.signature
      }))
    }
  })
})
