// DELETE /api/crm/records/:type/:id/channels/:linkId
// Detaches the address from the record. The channel identity row and the
// consent/suppression history hanging off it remain — only the link goes.
// Permission: <type>.update plus the record-visibility rule.

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { permFor } from '../../../../../../../utils/crm-perms'
import { assertRecordVisible, requireRecordType } from '../../../../../../../utils/list-records'
import { unlinkChannel } from '../../../../../../../utils/channels'

const uuidSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const typeKey = getRouterParam(event, 'type')!
  const id = getRouterParam(event, 'id')!
  const linkId = getRouterParam(event, 'linkId')!
  return await withOrgPermission(event, { appId: 'crm' }, permFor(typeKey, 'update'), async (tx, ctx) => {
    await requireRecordType(tx, typeKey)
    await assertRecordVisible(tx, ctx, typeKey, id)

    if (!uuidSchema.safeParse(linkId).success) {
      throw createError({ statusCode: 404, statusMessage: 'Channel link not found.' })
    }
    await unlinkChannel(tx, ctx, id, linkId)
    return { ok: true }
  })
})
