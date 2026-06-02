// GET /api/files/items/:id
// Returns one item. Docs include body_md; files include a fresh signed URL.

import { withOrgPermission } from '#tenant/server'
import { generateSignedUrl } from '#core/server/utils/storage'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'files' }, 'files.read', async (tx) => {
    const id = getRouterParam(event, 'id') ?? ''

    const item = await tx
      .selectFrom('files_items as f')
      .leftJoin('users as u', 'u.id', 'f.created_by')
      .select([
        'f.id',
        'f.kind',
        'f.title',
        'f.body_md',
        'f.storage_key',
        'f.filename',
        'f.mime',
        'f.size_bytes',
        'f.tags',
        'f.share_token',
        'f.created_at',
        'f.last_edited_at',
        'f.created_by',
        'u.display_name as created_by_name'
      ])
      .where('f.id', '=', id)
      .where('f.deleted_at', 'is', null)
      .executeTakeFirst()

    if (!item) throw createError({ statusCode: 404, statusMessage: 'Not found.' })

    const url = item.kind === 'file' && item.storage_key
      ? await generateSignedUrl(item.storage_key)
      : null

    // storage_key is internal — don't leak it to the client.
    const { storage_key: _omit, ...rest } = item
    return { item: { ...rest, url } }
  })
})
