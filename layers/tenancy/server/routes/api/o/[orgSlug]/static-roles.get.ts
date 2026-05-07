import { withOrgPermission } from '#tenant/server'
import { getRolePermissions } from '#core/server/utils/rbac'
import { getAllStaticRoles } from '#core/server/utils/roles-registry'

// Returns each static role (host + app-static) with the **base** permission
// set for this org, computed *without* org-scoped overrides. The override
// editor renders this as a checkbox column; toggling a box writes a row to
// `org_role_overrides` (handled by the role-overrides endpoint).
//
// Why pass `orgId=null` instead of `ctx.orgId`: the override editor's job is
// to let the user mutate the diff *over* the static base. If we returned
// post-override permissions, the +/- markers would compound and an admin
// would never see what tier 1+2+4 actually grants on its own.
export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.roles.read', async (tx) => {
    const unified = getAllStaticRoles()
    const out = await Promise.all(unified.map(async (role) => {
      const perms = await getRolePermissions(tx, [role.key], null)
      return {
        key: role.key,
        name: role.name,
        description: role.description,
        source: role.source,
        permissions: [...perms]
      }
    }))
    return { roles: out }
  })
})
