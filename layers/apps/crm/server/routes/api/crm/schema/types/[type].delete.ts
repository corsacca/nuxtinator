// DELETE /api/crm/schema/types/:type
// Deletes an admin-created record type (or a stale orphan row) along with
// its crm_record_fields rows. Code-declared types 400 (hide or revert them
// instead); types that still have records 409. Permission: crm.schema.manage.

import { withOrgPermission } from '#tenant/server'
import { deleteRecordType } from '#crm/server'

export default defineEventHandler(async (event) => {
  const typeKey = getRouterParam(event, 'type')!
  return await withOrgPermission(event, { appId: 'crm' }, 'crm.schema.manage', async (tx, ctx) => {
    await deleteRecordType(tx, ctx, typeKey)
    return { ok: true }
  })
})
