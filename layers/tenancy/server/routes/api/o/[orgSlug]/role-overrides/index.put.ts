import { withOrgPermission } from '#tenant/server'
import { isRegisteredPermission } from '#core/server/utils/permissions-registry'

// Bulk-replace the override rows for one (orgId, role_name) tuple.
//
// Body: { role: string, grants: string[], revokes: string[] }
//
// Strategy: delete every existing row for (orgId, role), then insert the new
// set in a single transaction. Avoids tracking per-row diffs and keeps the
// editor UI a simple "checkbox state".
//
// Subset-delegation: an editor cannot grant a permission they don't already
// hold in this org. Revokes are not gated — removing a permission is always
// safe (admin can re-grant).
export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.roles.write', async (tx, ctx) => {
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

    const missing = grants.filter(p => !ctx.perms.has(p as never))
    if (missing.length > 0) {
      throw createError({
        statusCode: 403,
        statusMessage: `Cannot grant permissions you don't hold: ${missing.join(', ')}`
      })
    }

    const now = new Date().toISOString()

    await tx
      .deleteFrom('org_role_overrides')
      .where('org_id', '=', ctx.orgId)
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
    for (const p of grants) rows.push({ org_id: ctx.orgId, role_name: role, permission: p, effect: 'grant', created_at: now, updated_at: now })
    for (const p of revokes) rows.push({ org_id: ctx.orgId, role_name: role, permission: p, effect: 'revoke', created_at: now, updated_at: now })

    if (rows.length > 0) {
      await tx.insertInto('org_role_overrides').values(rows).execute()
    }

    return { role, grants, revokes }
  })
})
