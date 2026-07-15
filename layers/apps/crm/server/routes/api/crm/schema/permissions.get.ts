// GET /api/crm/schema/permissions
// The registered crm.* permission catalog with display meta, for the
// per-user extras picker. Backed by the runtime permission registry, so
// crm.*-prefixed slugs registered by layers stacked on the CRM (inbox,
// marketing) appear too. Returns { permissions: [{ key, title,
// description }] } sorted by key. Permission: crm.schema.manage.

import { withOrgPermission } from '#tenant/server'
import { getAllPermissions, getPermissionMeta } from '#core/server/utils/permissions-registry'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'crm' }, 'crm.schema.manage', async () => {
    const permissions = getAllPermissions()
      .filter(p => p.startsWith('crm.'))
      .sort()
      .map((key) => {
        const meta = getPermissionMeta(key)
        return { key, title: meta?.title ?? key, description: meta?.description ?? '' }
      })
    return { permissions }
  })
})
