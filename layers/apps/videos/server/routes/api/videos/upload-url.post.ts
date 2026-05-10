// POST /api/videos/upload-url
// Generates pre-signed S3 PUT URLs for direct browser upload.
// Returns video and (optional) thumbnail upload URLs along with their keys.

import { v4 as uuidv4 } from 'uuid'
import { withOrgContext } from '#tenant/server'
import { generateUploadUrl } from '../../../utils/video-storage'

const ALLOWED_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi']
const ALLOWED_CONTENT_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/avi', 'video/x-msvideo']
const MAX_FILENAME_LENGTH = 255

export default defineEventHandler(async (event) => {
  return await withOrgContext(event, { appId: 'videos' }, async (_tx, _ctx) => {
    const body = await readBody(event)
    const { fileName, contentType, withThumbnail } = body

    if (!fileName || typeof fileName !== 'string') {
      throw createError({ statusCode: 400, message: 'fileName is required' })
    }
    if (fileName.length > MAX_FILENAME_LENGTH) {
      throw createError({ statusCode: 400, message: 'fileName is too long' })
    }

    const extension = fileName.split('.').pop()?.toLowerCase() || ''
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      throw createError({
        statusCode: 400,
        message: `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`
      })
    }

    const resolvedContentType = contentType || 'video/webm'
    if (!ALLOWED_CONTENT_TYPES.includes(resolvedContentType)) {
      throw createError({
        statusCode: 400,
        message: `Invalid content type. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}`
      })
    }

    const videoId = uuidv4()
    const videoKey = `${videoId}.${extension}`
    const videoUploadUrl = await generateUploadUrl(videoKey, resolvedContentType)

    let thumbnailUploadUrl: string | null = null
    let thumbnailKey: string | null = null
    if (withThumbnail) {
      thumbnailKey = `${videoId}-thumb.jpg`
      thumbnailUploadUrl = await generateUploadUrl(thumbnailKey, 'image/jpeg')
    }

    return {
      success: true,
      videoId,
      videoKey,
      videoUploadUrl,
      thumbnailKey,
      thumbnailUploadUrl
    }
  })
})
