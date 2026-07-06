// POST /api/crm/records/:type/:id/comments
// Body: { body } (1..10000 chars). Adds a comment authored by the caller and
// returns it ({ id, authorId, authorName, body, createdAt, editedAt }).
// Comments are their own timeline stream — no activity row is written.
// Permission: <type>.update plus the record-visibility rule.

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { permFor } from '../../../../../../utils/crm-perms'
import { assertRecordVisible, requireRecordType } from '../../../../../../utils/list-records'
import { addComment } from '../../../../../../utils/comments'

const Body = z.object({
  body: z.string().min(1).max(10000)
})

export default defineEventHandler(async (event) => {
  const typeKey = getRouterParam(event, 'type')!
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'crm' }, permFor(typeKey, 'update'), async (tx, ctx) => {
    await requireRecordType(tx, typeKey)
    await assertRecordVisible(tx, ctx, typeKey, id)

    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    return await addComment(tx, ctx, id, { body: parsed.data.body })
  })
})
