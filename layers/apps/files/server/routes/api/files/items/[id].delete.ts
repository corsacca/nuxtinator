// DELETE /api/files/items/:id
// Soft-deletes the item. For uploaded files, best-effort removes the S3 blob.

import { withOrgPermission } from '#tenant/server'
import { sql } from 'kysely'
import { deleteFromS3 } from '#core/server/utils/storage'
import { logDelete } from '#core/server/utils/activity-logger'
import { loadItem } from '../../../../utils/file-helpers'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'files' }, 'files.delete', async (tx, ctx) => {
    const id = getRouterParam(event, 'id') ?? ''

    const item = await loadItem(tx, id)
    if (!item) throw createError({ statusCode: 404, statusMessage: 'Not found.' })

    await tx
      .updateTable('files_items')
      .set({ deleted_at: sql<Date>`now()`, share_token: null })
      .where('id', '=', id)
      .execute()

    if (item.kind === 'file' && item.storage_key) {
      try {
        await deleteFromS3(item.storage_key)
      } catch (err) {
        // The row is already soft-deleted; a missing/failed blob delete
        // shouldn't fail the request. Log and move on.
        console.warn('files: failed to delete S3 blob', item.storage_key, err)
      }
    }

    logDelete('files_items', id, ctx.userId, { kind: item.kind })
    return { ok: true }
  })
})
