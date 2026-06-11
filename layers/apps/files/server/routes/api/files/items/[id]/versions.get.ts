// GET /api/files/items/:id/versions — list a doc's or site's version
// snapshots, newest first.

import { withOrgPermission } from '#tenant/server'
import { loadItem } from '../../../../../utils/file-helpers'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'files' }, 'files.read', async (tx) => {
    const id = getRouterParam(event, 'id') ?? ''

    const item = await loadItem(tx, id)
    if (!item) throw createError({ statusCode: 404, statusMessage: 'Not found.' })
    if (item.kind === 'file') return { versions: [] }

    const rows = await tx
      .selectFrom('files_versions as v')
      .leftJoin('users as u', 'u.id', 'v.edited_by')
      .select([
        'v.id',
        'v.title',
        'v.content',
        'v.edited_at',
        'v.edited_by',
        'u.display_name as edited_by_name'
      ])
      .where('v.item_id', '=', id)
      .orderBy('v.edited_at', 'desc')
      .execute()

    return { versions: rows }
  })
})
