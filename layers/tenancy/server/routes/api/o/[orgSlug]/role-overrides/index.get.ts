import { getQuery } from 'h3'
import { withOrgPermission } from '#tenant/server'

// List the override rows for a given role in the active org. Returns the raw
// `effect` rows; the UI overlays them on the role's tier-1+2+4 effective set.
export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.roles.read', async (tx, ctx) => {
    const query = getQuery(event)
    const role = typeof query.role === 'string' ? query.role : ''
    if (!role) {
      throw createError({ statusCode: 400, statusMessage: 'role query parameter required' })
    }

    const rows = await tx
      .selectFrom('org_role_overrides')
      .select(['permission', 'effect'])
      .where('org_id', '=', ctx.orgId)
      .where('role_name', '=', role)
      .execute()

    return { role, overrides: rows }
  })
})
