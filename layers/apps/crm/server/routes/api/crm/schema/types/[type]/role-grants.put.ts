// PUT /api/crm/schema/types/:type/role-grants
// Full replacement of the type's per-role action grants (config.roleGrants).
// Only explicit true/false entries persist — an absent (role, action) pair
// means "inherit from the role's slugs". Role keys must name real roles
// (static or custom; updateTypeRoleGrants only shape-checks), and 'admin' is
// rejected outright: admins bypass the matrix, so a stored admin row would
// be dead weight that misleads the next reader. Returns the refreshed GET
// shape. Permission: crm.schema.manage.

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { validateRoleNames } from '#core/server/utils/rbac'
import { buildRoleGrantsView, updateTypeRoleGrants } from '#crm/server'

// Action names and per-role shapes are validated by updateTypeRoleGrants
// (with per-entry error messages); zod only pins the outer contract.
const Body = z.object({
  grants: z.record(z.string(), z.record(z.string(), z.boolean()))
})

export default defineEventHandler(async (event) => {
  const typeKey = getRouterParam(event, 'type')!
  return await withOrgPermission(event, { appId: 'crm' }, 'crm.schema.manage', async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }

    const roleKeys = Object.keys(parsed.data.grants)
    if (roleKeys.includes('admin')) {
      throw createError({ statusCode: 400, statusMessage: 'The admin role always has full access and cannot carry grants' })
    }
    const { valid, unknown } = await validateRoleNames(tx, roleKeys)
    if (!valid) {
      throw createError({ statusCode: 400, statusMessage: `Unknown role(s): ${unknown.join(', ')}` })
    }

    const type = await updateTypeRoleGrants(tx, ctx, typeKey, parsed.data.grants)
    return await buildRoleGrantsView(tx, ctx, type)
  })
})
