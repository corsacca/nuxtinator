// DELETE /api/inbox/conversations/:id/attachments/:attachmentId
// Removes an attachment from a draft on this conversation. Only draft
// attachments can be removed — a sent message's attachments are history.

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const attachmentId = getRouterParam(event, 'attachmentId')!
  // Both params reach uuid-typed queries — malformed ids must be a clean 400,
  // not a Postgres cast error surfacing as 500.
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(attachmentId).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx) => {
    const deleted = await inboxDeleteDraftAttachment(tx, attachmentId, id)
    if (!deleted) {
      throw createError({ statusCode: 404, statusMessage: 'Attachment not found' })
    }
    return { success: true }
  })
})
