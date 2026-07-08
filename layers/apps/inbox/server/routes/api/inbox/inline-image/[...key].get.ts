// GET /api/inbox/inline-image/<key>
// Authenticated proxy for composer/thread inline images. Served with the real
// (sniffed) image content-type so it renders inline — safe ONLY because upload
// proved the type. Guards: the key must have the inbox-inline prefix and no
// traversal (else this is a read-any-key oracle into the private bucket), and
// its org segment must match the caller's org (a leaked key can't cross orgs).

import { withOrgPermission } from '#tenant/server'
import { generateSignedUrl } from '#core/server/utils/storage'

export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, 'key')
  const key = Array.isArray(raw) ? raw.join('/') : String(raw || '')
  const mime = inboxInlineMimeForKey(key)
  if (!inboxIsInlineImageKey(key) || !mime) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx, ctx) => {
    if (inboxInlineKeyOrgSegment(key) !== (ctx.orgId ?? 'single')) {
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    }
    const url = await generateSignedUrl(key, 300)
    const upstream = await fetch(url)
    if (!upstream.ok || !upstream.body) {
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    }
    setResponseHeaders(event, {
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=3600'
    })
    return sendStream(event, upstream.body as ReadableStream<Uint8Array>)
  })
})
