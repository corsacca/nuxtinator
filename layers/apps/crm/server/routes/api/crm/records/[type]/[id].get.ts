// GET /api/crm/records/:type/:id
// Hydrated record detail: every field materialized into `fields` (channel
// entries, connections, and user refs included). Permission: <type>.read
// plus the record-visibility rule — view_all, shared, or referenced through
// a user field; invisible records 404 like missing ones.

import { withOrgPermission } from '#tenant/server'
import { assertRecordVisible, getRecord, permFor, requireRecordType } from '#crm/server'

export default defineEventHandler(async (event) => {
  const typeKey = getRouterParam(event, 'type')!
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'crm' }, permFor(typeKey, 'read'), async (tx, ctx) => {
    await requireRecordType(tx, typeKey)
    await assertRecordVisible(tx, ctx, typeKey, id)

    const record = await getRecord(tx, ctx, typeKey, id)
    return {
      id: record.id,
      typeKey: record.recordType,
      name: record.name,
      status: record.status,
      fields: record.fields,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      createdBy: record.createdBy
    }
  })
})
