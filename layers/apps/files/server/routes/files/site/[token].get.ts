// GET /files/site/:token  — PUBLIC (no auth). Serves a shared site's HTML
// raw, so the share link opens as a real full-tab page (not a download or an
// in-app preview). A non-/api Nitro route: explicit server routes take
// precedence over the SPA fallback, so this never reaches the Vue router.
//
// Security: the page is served with a CSP `sandbox` directive WITHOUT
// `allow-same-origin`, which puts it in an opaque origin. Its scripts run,
// but its requests are cross-site to the app, so they never carry a
// visitor's auth cookie — uploaded HTML can't call /api/* as whoever opens
// the link. Never add `allow-same-origin` here.
//
// Org resolution mirrors /api/files/public/:token — `withRecordOrgContext`
// resolves the org from the share token itself (BYPASSRLS lookup + GUC in
// multi mode, plain transaction in single mode).

import { withRecordOrgContext } from '#tenant/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''

  if (!UUID_RE.test(token)) {
    throw createError({ statusCode: 404, statusMessage: 'Link not found.' })
  }

  return await withRecordOrgContext(
    event,
    { table: 'files_items', id: token, idColumn: 'share_token', notFoundMessage: 'Link not found.' },
    async (tx) => {
      const item = await tx
        .selectFrom('files_items')
        .select(['kind', 'body_md'])
        .where('share_token', '=', token)
        .where('deleted_at', 'is', null)
        .executeTakeFirst()

      if (!item || item.kind !== 'site') {
        throw createError({ statusCode: 404, statusMessage: 'Link not found.' })
      }

      setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
      setHeader(event, 'Content-Security-Policy', 'sandbox allow-scripts allow-forms allow-popups allow-modals')
      setHeader(event, 'X-Content-Type-Options', 'nosniff')
      setHeader(event, 'Referrer-Policy', 'no-referrer')
      // Saves go live immediately — don't let intermediaries serve stale copies.
      setHeader(event, 'Cache-Control', 'no-store')
      return item.body_md ?? ''
    }
  )
})
