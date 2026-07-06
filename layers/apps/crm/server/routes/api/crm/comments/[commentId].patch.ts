// PATCH /api/crm/comments/:commentId
// Body: { body } (1..10000 chars). Edits a comment and returns it
// ({ id, authorId, authorName, body, createdAt, editedAt }).
//
// Author-or-moderator rule: the author may edit their own comment; a caller
// holding the record type's delete permission (the moderator bar) may edit
// anyone's. The type-scoped permissions depend on the comment's record, so
// the route is gated on crm.access and checks <type>.update — plus the
// record-visibility rule — after loading the comment.

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { permFor } from '../../../../utils/crm-perms'
import { assertRecordVisible } from '../../../../utils/list-records'
import { getCommentRecord, updateComment } from '../../../../utils/comments'

const Body = z.object({
  body: z.string().min(1).max(10000)
})

export default defineEventHandler(async (event) => {
  const commentId = getRouterParam(event, 'commentId')!
  return await withOrgPermission(event, { appId: 'crm' }, 'crm.access', async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }

    const ref = await getCommentRecord(tx, commentId)
    if (!ref) {
      throw createError({ statusCode: 404, statusMessage: 'Comment not found.' })
    }
    const updatePerm = permFor(ref.recordType, 'update')
    if (!ctx.perms.has(updatePerm)) {
      throw createError({ statusCode: 403, statusMessage: `Permission required: ${updatePerm}` })
    }
    await assertRecordVisible(tx, ctx, ref.recordType, ref.recordId)

    const canModerate = ctx.perms.has(permFor(ref.recordType, 'delete'))
    return await updateComment(tx, ctx, commentId, parsed.data.body, { canModerate })
  })
})
