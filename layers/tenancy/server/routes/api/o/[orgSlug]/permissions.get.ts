import { withOrgPermission } from '#tenant/server'
import { getAllPermissions, getPermissionMeta } from '#core/server/utils/permissions-registry'

// Org-scoped variant of `/api/admin/permissions`. Returns the full set of
// runtime-registered permissions for the role / override pickers. Layer
// uninstalls drop their permission strings here automatically.
export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.roles.read', async () => {
    const perms = getAllPermissions()
    return {
      permissions: perms.map((perm) => {
        const meta = getPermissionMeta(perm)
        return {
          perm,
          title: meta?.title ?? perm,
          description: meta?.description ?? ''
        }
      })
    }
  })
})
