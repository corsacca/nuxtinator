// GET /api/inbox/attachments/:id
// Authenticated streaming proxy for inbound attachments. The response always
// forces `Content-Disposition: attachment` + `application/octet-stream` so a
// malicious HTML/SVG attachment can never render in the app's origin
// (stored-XSS defense) — which is why clients get this route and never a raw
// signed S3 URL (those can't override response headers).

import { withOrgPermission } from '#tenant/server'
import { generateSignedUrl } from '#core/server/utils/storage'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const attachment = await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx) => {
    const row = await inboxGetAttachment(tx, id)
    if (!row) {
      throw createError({ statusCode: 404, statusMessage: 'Attachment not found' })
    }
    return row
  })

  const url = await generateSignedUrl(attachment.s3_key, 300)
  const upstream = await fetch(url)
  if (!upstream.ok || !upstream.body) {
    throw createError({ statusCode: 502, statusMessage: 'Attachment fetch failed' })
  }

  // Strip quotes, CR/LF, AND backslashes (a trailing backslash would escape
  // the closing quote of the quoted-string header) and bound the length.
  const safeName = (attachment.filename || 'attachment').replace(/[\\"\r\n]/g, '_').slice(0, 200)
  setResponseHeaders(event, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${safeName}"`,
    'Cache-Control': 'private, max-age=0'
  })
  if (attachment.size_bytes) {
    setResponseHeader(event, 'Content-Length', attachment.size_bytes)
  }
  return sendStream(event, upstream.body as ReadableStream<Uint8Array>)
})
