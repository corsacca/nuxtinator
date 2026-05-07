import { getRouterParam } from 'h3'
import { adminDb as db } from '#tenant/admin-db'
import { requireHostAdmin } from '#tenant/server'

// Host-admin parallel for `GET /api/o/:orgSlug/roles`. Lists custom roles for
// the target org without requiring membership. Runs on `adminDb` (BYPASSRLS),
// so the explicit `where('org_id', ...)` predicate is what scopes the result.
export default defineEventHandler(async (event) => {
  await requireHostAdmin(event)
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) throw createError({ statusCode: 400, statusMessage: 'orgId required' })

  const rows = await db
    .selectFrom('custom_roles')
    .select(['id', 'name', 'description', 'permissions', 'created', 'updated'])
    .where('org_id', '=', orgId)
    .orderBy('name', 'asc')
    .execute()

  return { roles: rows }
})
