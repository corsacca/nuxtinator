import { getRouterParam } from 'h3'
import { adminDb as db } from '#tenant/admin-db'
import { requireHostAdmin } from '#tenant/server'

// Host-admin parallel for `DELETE /api/o/:orgSlug/roles/:id`. Memberships that
// referenced this role silently lose it on next perm-resolution (orphan-filter
// via `isRegisteredPermission`); the rows themselves don't need rewriting.
export default defineEventHandler(async (event) => {
  await requireHostAdmin(event)
  const orgId = getRouterParam(event, 'orgId')
  const id = getRouterParam(event, 'id')
  if (!orgId) throw createError({ statusCode: 400, statusMessage: 'orgId required' })
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const role = await db
    .selectFrom('custom_roles')
    .select(['id', 'name'])
    .where('id', '=', id)
    .where('org_id', '=', orgId)
    .executeTakeFirst()
  if (!role) throw createError({ statusCode: 404, statusMessage: 'Role not found' })

  await db
    .deleteFrom('custom_roles')
    .where('id', '=', id)
    .where('org_id', '=', orgId)
    .execute()

  return { success: true }
})
