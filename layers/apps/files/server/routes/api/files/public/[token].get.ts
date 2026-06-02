// GET /api/files/public/:token  — PUBLIC (no auth).
// Resolves a share link to its item. In multi-tenant mode the item's org is
// resolved from the token via `withRecordOrgContext` (BYPASSRLS lookup + GUC
// set), so the files layer never imports `#tenant/admin-db`. In single mode
// it's a plain transaction. The token is a UUID (gen_random_uuid), which the
// helper's UUID validation requires.

import { withRecordOrgContext } from '#tenant/server'
import { generateSignedUrl } from '#core/server/utils/storage'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''

  // Guard the token shape before the query. share_token is a uuid column, so a
  // non-UUID would otherwise throw a 22P02 cast error → 500 in single mode
  // (the multi-mode withRecordOrgContext validates this internally; single
  // mode is a passthrough).
  if (!UUID_RE.test(token)) {
    throw createError({ statusCode: 404, statusMessage: 'Link not found.' })
  }

  return await withRecordOrgContext(
    event,
    { table: 'files_items', id: token, idColumn: 'share_token', notFoundMessage: 'Link not found.' },
    async (tx) => {
      const item = await tx
        .selectFrom('files_items')
        .select(['id', 'kind', 'title', 'body_md', 'storage_key', 'filename', 'mime', 'size_bytes'])
        .where('share_token', '=', token)
        .where('deleted_at', 'is', null)
        .executeTakeFirst()

      if (!item) throw createError({ statusCode: 404, statusMessage: 'Link not found.' })

      if (item.kind === 'doc') {
        return { kind: 'doc' as const, title: item.title, body_md: item.body_md ?? '' }
      }

      const url = item.storage_key ? await generateSignedUrl(item.storage_key) : null
      return {
        kind: 'file' as const,
        title: item.title,
        filename: item.filename,
        mime: item.mime,
        size_bytes: item.size_bytes,
        url
      }
    }
  )
})
