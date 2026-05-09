/**
 * GET /api/admin/feedback/:id/attachments — operator-admin file listing.
 * Mints fresh signed URLs at read time so the dashboard can render thumbnails
 * without persisting URLs that expire.
 */
import { db } from '#core/server/utils/database'
import { requireOperatorAdmin } from '#tenant/server'
import { generateSignedUrl } from '#core/server/utils/storage'

export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const card = await db
    .selectFrom('cards')
    .select(['id', 'post_type'])
    .where('id', '=', id)
    .executeTakeFirst()

  if (!card) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (card.post_type !== 'feedback') {
    throw createError({ statusCode: 400, statusMessage: 'Not a feedback card' })
  }

  const rows = await db
    .selectFrom('feedback_attachments')
    .select(['id', 'kind', 'storage_key', 'filename', 'mime_type', 'size_bytes', 'created_at'])
    .where('card_id', '=', id)
    .orderBy('created_at', 'asc')
    .execute()

  return await Promise.all(rows.map(async (a) => ({
    id: a.id,
    kind: a.kind,
    filename: a.filename,
    mime_type: a.mime_type,
    size_bytes: a.size_bytes,
    created_at: a.created_at,
    url: await generateSignedUrl(a.storage_key)
  })))
})
