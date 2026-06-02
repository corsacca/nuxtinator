// GET /api/files/items?tag=
// Lists the org's files (docs + uploads), newest first. Optional ?tag= filter.

import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'files' }, 'files.read', async (tx) => {
    const q = getQuery(event)
    const tag = typeof q.tag === 'string' ? q.tag.trim() : ''

    let qb = tx
      .selectFrom('files_items as f')
      .leftJoin('users as u', 'u.id', 'f.created_by')
      .select([
        'f.id',
        'f.kind',
        'f.title',
        'f.filename',
        'f.mime',
        'f.size_bytes',
        'f.tags',
        'f.created_at',
        'f.last_edited_at',
        'f.created_by',
        'u.display_name as created_by_name',
        eb => eb('f.share_token', 'is not', null).as('has_link')
      ])
      .where('f.deleted_at', 'is', null)
      .orderBy('f.created_at', 'desc')

    if (tag) qb = qb.where(eb => eb(eb.val(tag), '=', eb.fn.any('f.tags')))

    const rows = await qb.execute()
    return { items: rows }
  })
})
