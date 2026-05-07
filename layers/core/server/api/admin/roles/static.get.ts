import { requireOperatorAdmin } from '#tenant/server'
import { db } from '#core/server/utils/database'
import { getRolePermissions } from '../../../utils/rbac'
import { getAllStaticRoles } from '../../../utils/roles-registry'

// Returns each static role (host + app-static) with its **effective**
// permissions resolved through `getRolePermissions`. Static roles have no
// org-specific component (no custom roles, no overrides), so passing
// `orgId=null` is correct — the result is the same in every org.
//
// This is the only way for the client to see admin's true permission set,
// since admin gets expanded server-side in the role-resolution chokepoint
// and the static `ROLES.admin.permissions` array no longer reflects what
// admin actually holds.
export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)

  const unified = getAllStaticRoles()
  const out = await Promise.all(unified.map(async (role) => {
    const perms = await getRolePermissions(db, [role.key], null)
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
