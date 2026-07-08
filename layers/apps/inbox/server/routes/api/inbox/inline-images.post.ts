// POST /api/inbox/inline-images
// Multipart { image }. Uploads a composer inline image (reply or new-compose;
// no conversation needed — the org scopes it). Magic-byte sniffed, ≤10 MB,
// stored private under inbox-inline/<org>/<hex>.<ext>. Returns the auth-proxy
// URL the editor inserts as <img src>.

import { withOrgPermission } from '#tenant/server'
import { uploadToS3 } from '#core/server/utils/storage'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx, ctx) => {
    const form = await readFormData(event).catch(() => null)
    const file = form?.get('image')
    if (!(file instanceof File)) {
      throw createError({ statusCode: 400, statusMessage: 'image is required' })
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    if (!bytes.length) {
      throw createError({ statusCode: 400, statusMessage: 'Empty image' })
    }
    if (bytes.length > INBOX_INLINE_MAX_BYTES) {
      throw createError({ statusCode: 413, statusMessage: 'Image exceeds 10 MB' })
    }
    const mime = inboxSniffImageMime(bytes)
    if (!mime) {
      throw createError({ statusCode: 415, statusMessage: 'Unsupported image type — only JPEG, PNG, GIF, and WebP are accepted' })
    }

    const ext = inboxInlineExtForMime(mime)!
    const orgSegment = ctx.orgId ?? 'single'
    const upload = await uploadToS3(bytes, `img.${ext}`, mime, 'private', `${INBOX_INLINE_PREFIX}/${orgSegment}`)
    return { url: `/api/inbox/inline-image/${upload.key}` }
  })
})
