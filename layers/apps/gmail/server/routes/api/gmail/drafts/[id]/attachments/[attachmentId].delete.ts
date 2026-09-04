// DELETE /api/gmail/drafts/:id/attachments/:attachmentId
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const attachmentId = getRouterParam(event, 'attachmentId')!
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    try {
      await gmailRemoveDraftAttachment(tx, ctx.userId, id, attachmentId)
      return { ok: true }
    } catch (err) {
      if (err instanceof GmailDraftError) throw createError({ statusCode: err.statusCode, statusMessage: err.message })
      throw err
    }
  })
})
