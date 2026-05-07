import { getQuery } from 'h3'
import { withOrgPermission } from '#tenant/server'

// Reset overrides for a role back to defaults — i.e. delete every row in
// `org_role_overrides` for (orgId, role).
export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.roles.write', async (tx, ctx) => {
    const query = getQuery(event)
    const role = typeof query.role === 'string' ? query.role : ''
    if (!role) {
      throw createError({ statusCode: 400, statusMessage: 'role query parameter required' })
    }

    await tx
      .deleteFrom('org_role_overrides')
      .where('org_id', '=', ctx.orgId)
      .where('role_name', '=', role)
      .execute()

    return { success: true }
  })
})
