// DELETE /api/crm/records/:type/:id
// Hard delete — satellite rows cascade away with the record, so nothing is
// written to the (record-keyed) activity timeline. Permission: <type>.delete
// plus the record-visibility rule.

import { withOrgPermission } from '#tenant/server'
import { assertRecordVisible, deleteRecord, permFor, requireRecordType } from '#crm/server'

export default defineEventHandler(async (event) => {
  const typeKey = getRouterParam(event, 'type')!
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'crm' }, permFor(typeKey, 'delete'), async (tx, ctx) => {
    await requireRecordType(tx, typeKey)
    await assertRecordVisible(tx, ctx, typeKey, id)
    await deleteRecord(tx, ctx, typeKey, id)
    return { ok: true }
  })
})
