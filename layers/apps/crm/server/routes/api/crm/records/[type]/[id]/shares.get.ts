// GET /api/crm/records/:type/:id/shares
// Everyone this record is shared with, joined with the user directory:
// { items: [{ userId, name, email, avatarUrl, grantedBy, createdAt }],
//   canShare }. `canShare` reports whether the caller holds <type>.share —
// the share UI's gate signal (there is no client-side org-permission store
// to ask); the write routes enforce the permission regardless.
// Permission: <type>.read plus the record-visibility rule.

import { withOrgPermission } from '#tenant/server'
import { assertRecordVisible, listShares, permFor, requireRecordType } from '#crm/server'

export default defineEventHandler(async (event) => {
  const typeKey = getRouterParam(event, 'type')!
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'crm' }, permFor(typeKey, 'read'), async (tx, ctx) => {
    await requireRecordType(tx, typeKey)
    await assertRecordVisible(tx, ctx, typeKey, id)

    return {
      items: await listShares(tx, id),
      canShare: ctx.perms.has(permFor(typeKey, 'share'))
    }
  })
})
