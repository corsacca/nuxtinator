// POST /api/messages/uploads
// multipart/form-data with a "file" field. Uploads to S3 (private bucket
// with signed URL by default) and returns the upload metadata. The client
// then references storage_key/filename/mime/size_bytes when creating an item.

import { withOrgPermission } from '#tenant/server'
import { uploadToS3, validateFileSize } from '#core/server/utils/storage'

const MAX_SIZE_MB = 50

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'messages' }, 'messages.write', async (_tx, _ctx) => {
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

    const result = await uploadToS3(
      Buffer.from(data),
      originalFilename,
      contentType,
      'private'
    )

    return {
      storage_key: result.key,
      url: result.url,
      filename: result.filename,
      mime: contentType,
      size_bytes: data.byteLength
    }
  })
})
