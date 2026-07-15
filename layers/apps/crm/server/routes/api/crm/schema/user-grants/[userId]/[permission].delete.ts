// DELETE /api/crm/schema/user-grants/:userId/:permission
// Revokes one direct crm.* grant. The crm.* prefix is enforced (this surface
// never touches other layers' grants) but registration is not — orphan slugs
// left by an uninstalled layer must stay revocable. Revoking a grant the
// user doesn't hold is a no-op. Returns the refreshed grants list.
// Permission: crm.schema.manage.

import { withOrgPermission } from '#tenant/server'
import { revokeUserPermission } from '#core/server/utils/permission-grants'
import { assertCrmPermissionSlug, listCrmUserGrants, requireGrantTarget } from '#crm/server'

export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'userId')!
  const permission = getRouterParam(event, 'permission')!
  return await withOrgPermission(event, { appId: 'crm' }, 'crm.schema.manage', async (tx, ctx) => {
    assertCrmPermissionSlug(permission)
    await requireGrantTarget(tx, ctx, userId)
    await revokeUserPermission(tx, ctx, userId, permission)
    return { items: await listCrmUserGrants(tx, userId) }
  })
})
