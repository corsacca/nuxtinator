// DELETE /api/crm/comments/:commentId
// Deletes a comment; returns { ok: true }.
//
// Author-or-moderator rule: the author may delete their own comment; a caller
// holding the record type's delete permission (the moderator bar) may delete
// anyone's. The type-scoped permissions depend on the comment's record, so
// the route is gated on crm.access and checks <type>.update — plus the
// record-visibility rule — after loading the comment.

import { withOrgPermission } from '#tenant/server'
import { permFor } from '../../../../utils/crm-perms'
import { assertRecordVisible } from '../../../../utils/list-records'
import { deleteComment, getCommentRecord } from '../../../../utils/comments'

export default defineEventHandler(async (event) => {
  const commentId = getRouterParam(event, 'commentId')!
  return await withOrgPermission(event, { appId: 'crm' }, 'crm.access', async (tx, ctx) => {
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
    await deleteComment(tx, ctx, commentId, { canModerate })
    return { ok: true }
  })
})
