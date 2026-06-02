// POST /api/files/items/:id/replace
// multipart/form-data with a "file" field. Swaps the binary on an existing
// kind='file' item: uploads the new blob to S3, repoints storage_key + metadata,
// and best-effort removes the old blob. The item id (and any share link) survive.

import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'
import { uploadToS3, deleteFromS3, validateFileSize } from '#core/server/utils/storage'
import { logUpdate } from '#core/server/utils/activity-logger'
import { loadItem } from '../../../../../utils/file-helpers'

const MAX_SIZE_MB = 50

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'files' }, 'files.write', async (tx, ctx) => {
    const id = getRouterParam(event, 'id') ?? ''

    const item = await loadItem(tx, id)
    if (!item) throw createError({ statusCode: 404, statusMessage: 'Not found.' })
    if (item.kind !== 'file') {
      throw createError({ statusCode: 400, statusMessage: 'Only uploaded files can be replaced.' })
    }

    const parts = await readMultipartFormData(event)
    if (!parts) {
      throw createError({ statusCode: 400, statusMessage: 'Expected multipart/form-data.' })
    }

    const filePart = parts.find(p => p.name === 'file' && p.filename)
    if (!filePart) {
      throw createError({ statusCode: 400, statusMessage: 'No "file" field in upload.' })
    }

    const data = filePart.data
    const originalFilename = filePart.filename ?? 'upload'
    const contentType = filePart.type ?? 'application/octet-stream'

    if (!validateFileSize(data.byteLength, MAX_SIZE_MB)) {
      throw createError({ statusCode: 413, statusMessage: `File too large (max ${MAX_SIZE_MB} MB).` })
    }

    const oldKey = item.storage_key
    const result = await uploadToS3(Buffer.from(data), originalFilename, contentType, 'private')

    const updated = await tx
      .updateTable('files_items')
      .set({
        storage_key: result.key,
        filename: originalFilename,
        mime: contentType,
        size_bytes: data.byteLength,
        last_edited_by: ctx.userId,
        last_edited_at: sql<Date>`now()`
      })
      .where('id', '=', id)
      .returning(['id', 'kind', 'title', 'filename', 'mime', 'size_bytes', 'tags', 'created_at'])
      .executeTakeFirstOrThrow()

    // Best-effort cleanup of the superseded blob — mirrors the delete route.
    if (oldKey && oldKey !== result.key) {
      try {
        await deleteFromS3(oldKey)
      } catch (err) {
        console.warn('files: failed to delete replaced S3 blob', oldKey, err)
      }
    }

    logUpdate('files_items', id, ctx.userId, { kind: 'file', mime: contentType, replaced: true })

    return { item: updated }
  })
})
