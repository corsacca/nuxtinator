import { getRouterParam, getQuery } from 'h3'
import { adminDb as db } from '#tenant/admin-db'
import { requireHostAdmin } from '#tenant/server'

// Host-admin parallel for `GET /api/o/:orgSlug/role-overrides?role=admin`.
export default defineEventHandler(async (event) => {
  await requireHostAdmin(event)
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) throw createError({ statusCode: 400, statusMessage: 'orgId required' })

  const query = getQuery(event)
  const role = typeof query.role === 'string' ? query.role : ''
  if (!role) {
    throw createError({ statusCode: 400, statusMessage: 'role query parameter required' })
  }

  const rows = await db
    .selectFrom('org_role_overrides')
    .select(['permission', 'effect'])
    .where('org_id', '=', orgId)
    .where('role_name', '=', role)
    .execute()

  return { role, overrides: rows }
})
