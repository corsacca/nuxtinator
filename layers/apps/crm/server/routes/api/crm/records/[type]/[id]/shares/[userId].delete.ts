// DELETE /api/crm/records/:type/:id/shares/:userId
// Revokes the target user's share of this record. Idempotent: removing a
// share that doesn't exist is a no-op. Returns the refreshed share list in
// the same shape as the GET. Permission: the type evaluator's share answer
// plus the record-visibility rule.

import { withOrgContext } from '#tenant/server'
import { assertRecordVisible, listShares, removeShare, requireRecordType, requireTypePermission } from '#crm/server'

export default defineEventHandler(async (event) => {
  const typeKey = getRouterParam(event, 'type')!
  const id = getRouterParam(event, 'id')!
  const userId = getRouterParam(event, 'userId')!
  return await withOrgContext(event, { appId: 'crm' }, async (tx, ctx) => {
    await requireTypePermission(tx, ctx, typeKey, 'share')
    await requireRecordType(tx, typeKey)
    await assertRecordVisible(tx, ctx, typeKey, id)

    await removeShare(tx, ctx, id, userId)
    return { items: await listShares(tx, id) }
  })
})
