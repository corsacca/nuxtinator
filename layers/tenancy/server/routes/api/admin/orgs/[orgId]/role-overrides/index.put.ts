import { getRouterParam } from 'h3'
import { adminDb as db } from '#tenant/admin-db'
import { requireHostAdmin } from '#tenant/server'
import { isRegisteredPermission } from '#core/server/utils/permissions-registry'

// Host-admin parallel for `PUT /api/o/:orgSlug/role-overrides`. Bulk-replaces
// the override rows for one (orgId, role_name) tuple. No subset-delegation
// (host admin god-mode).
//
// Body: { role: string, grants: string[], revokes: string[] }
export default defineEventHandler(async (event) => {
  await requireHostAdmin(event)
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) throw createError({ statusCode: 400, statusMessage: 'orgId required' })

  const body = await readBody(event)
  const role = typeof body?.role === 'string' ? body.role : ''
  if (!role) {
    throw createError({ statusCode: 400, statusMessage: 'role required' })
  }

  const grants = Array.isArray(body?.grants)
    ? Array.from(new Set(body.grants.filter((p: unknown): p is string =>
        typeof p === 'string' && isRegisteredPermission(p))))
    : []
  const revokes = Array.isArray(body?.revokes)
    ? Array.from(new Set(body.revokes.filter((p: unknown): p is string =>
        typeof p === 'string' && isRegisteredPermission(p))))
    : []

  const overlapping = grants.filter(p => revokes.includes(p))
  if (overlapping.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `A permission cannot be both granted and revoked: ${overlapping.join(', ')}`
    })
  }

  const now = new Date().toISOString()

  await db.transaction().execute(async (tx) => {
    await tx
      .deleteFrom('org_role_overrides')
      .where('org_id', '=', orgId)
      .where('role_name', '=', role)
      .execute()

    const rows: Array<{
      org_id: string
      role_name: string
      permission: string
      effect: 'grant' | 'revoke'
      created_at: string
      updated_at: string
    }> = []
    for (const p of grants) rows.push({ org_id: orgId, role_name: role, permission: p, effect: 'grant', created_at: now, updated_at: now })
    for (const p of revokes) rows.push({ org_id: orgId, role_name: role, permission: p, effect: 'revoke', created_at: now, updated_at: now })
    if (rows.length > 0) {
      await tx.insertInto('org_role_overrides').values(rows).execute()
    }
  })

  return { role, grants, revokes }
})
