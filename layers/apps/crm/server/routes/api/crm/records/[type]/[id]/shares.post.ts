// POST /api/crm/records/:type/:id/shares
// Body: { userId } — grants the target user visibility of this record.
// Idempotent: re-sharing with an already-shared user is a no-op. Returns the
// refreshed share list in the same shape as the GET.
// Permission: <type>.share plus the record-visibility rule.

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { addShare, assertRecordVisible, listShares, permFor, requireRecordType } from '#crm/server'

const Body = z.object({
  userId: z.string().uuid()
})

export default defineEventHandler(async (event) => {
  const typeKey = getRouterParam(event, 'type')!
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'crm' }, permFor(typeKey, 'share'), async (tx, ctx) => {
    await requireRecordType(tx, typeKey)
    await assertRecordVisible(tx, ctx, typeKey, id)

    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }

    await addShare(tx, ctx, id, parsed.data.userId)
    return { items: await listShares(tx, id) }
  })
})
