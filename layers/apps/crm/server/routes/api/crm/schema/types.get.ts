// GET /api/crm/schema/types
// Merged record-type catalog (code manifests ⊳ DB overrides). Returns
// { types: [{ key, label, labelSingular, icon, hidden, custom, orphan,
//   statusField }] }. Hidden and stale (orphan) entries only appear for
// schema managers — the schema builder needs them; navigation does not.
// Permission: crm.access.

import { withOrgPermission } from '#tenant/server'
import { getRecordTypes } from '#crm/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'crm' }, 'crm.access', async (tx, ctx) => {
    const canManage = ctx.perms.has('crm.schema.manage')
    const types = await getRecordTypes(tx)
    return {
      types: types
        .filter(t => canManage || (!t.hidden && !t.orphan))
        .map(t => ({
          key: t.key,
          label: t.label,
          labelSingular: t.labelSingular,
          icon: t.icon ?? null,
          hidden: t.hidden,
          custom: t.custom,
          orphan: t.orphan,
          statusField: t.statusField ?? null
        }))
    }
  })
})
