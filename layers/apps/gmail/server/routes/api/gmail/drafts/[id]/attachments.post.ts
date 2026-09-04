// POST /api/gmail/drafts/:id/attachments — multipart upload of one file.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'file' && p.filename)
  if (!file || !file.data?.length) throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  if (file.data.length > GMAIL_MAX_ATTACHMENT_TOTAL_BYTES) throw createError({ statusCode: 413, statusMessage: 'File exceeds 25 MB' })
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    try {
      const meta = await gmailAddDraftAttachment(tx, ctx.userId, id, {
        filename: file.filename!,
        contentType: file.type || 'application/octet-stream',
        content: file.data
      })
      return { attachment: { id: meta.id, filename: meta.filename, contentType: meta.contentType, size: meta.size } }
    } catch (err) {
      if (err instanceof GmailDraftError) throw createError({ statusCode: err.statusCode, statusMessage: err.message })
      throw err
    }
  })
})
