// GET /api/gmail/messages/:id/attachments/:index
// Authenticated attachment proxy. Images keep their real type so inline
// references render; everything else is forced to a download as
// application/octet-stream so hostile HTML or SVG can never run in the app's
// origin.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const index = Number.parseInt(getRouterParam(event, 'index') ?? '', 10)
  if (!Number.isInteger(index) || index < 0) throw createError({ statusCode: 400, statusMessage: 'Invalid attachment index' })
  const userId = await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (_tx, ctx) => ctx.userId)
  let attachment
  try {
    attachment = await gmailFetchAttachment(userId, id, index)
  } catch (err) {
    if (err instanceof GmailBodyUnavailable) throw createError({ statusCode: 409, statusMessage: err.message })
    throw err
  }
  if (!attachment) throw createError({ statusCode: 404, statusMessage: 'Attachment not found' })

  const safeName = (attachment.filename || 'attachment').replace(/[\\"\r\n]/g, '_').slice(0, 200)
  const type = attachment.contentType.toLowerCase()
  const isSafeImage = /^image\/(png|jpe?g|gif|webp|bmp|avif)$/.test(type)
  setResponseHeaders(event, {
    'Content-Type': isSafeImage ? type : 'application/octet-stream',
    'Content-Disposition': `${isSafeImage ? 'inline' : 'attachment'}; filename="${safeName}"`,
    'Content-Length': attachment.content.length,
    'Cache-Control': 'private, max-age=3600'
  })
  return attachment.content
})
