// GET /api/crm/records/:type/:id/shares
// Everyone this record is shared with, joined with the user directory:
// { items: [{ userId, name, email, avatarUrl, level, grantedBy, createdAt }],
//   canShare }. `canShare` reports the type evaluator's share answer — kept
// for callers that read the flag from this endpoint, though the record
// detail's capabilities block is the canonical source; the write routes
// enforce the permission regardless. Permission: the type evaluator's read
// answer plus the record-visibility rule.

import { withOrgContext } from '#tenant/server'
import { assertRecordVisible, listShares, requireRecordType, requireTypePermission, resolveTypePermission } from '#crm/server'

export default defineEventHandler(async (event) => {
  const typeKey = getRouterParam(event, 'type')!
  const id = getRouterParam(event, 'id')!
  return await withOrgContext(event, { appId: 'crm' }, async (tx, ctx) => {
    await requireTypePermission(tx, ctx, typeKey, 'read')
    await requireRecordType(tx, typeKey)
    await assertRecordVisible(tx, ctx, typeKey, id)

    return {
      items: await listShares(tx, id),
      canShare: await resolveTypePermission(tx, ctx, typeKey, 'share')
    }
  })
})
