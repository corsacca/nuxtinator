// POST /api/videos/upload-complete
// Persists video metadata after the browser has uploaded the file to S3.

import { randomBytes } from 'crypto'
import { withOrgContext } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgContext(event, { appId: 'videos' }, async (tx, ctx) => {
    const body = await readBody(event)
    const {
      videoId,
      videoKey,
      thumbnailKey,
      duration,
      fileSize,
      width,
      height,
      source = 'recording',
      originalFilename,
      originalFileSize,
      compressionRatio,
      visibility
    } = body

    if (!videoId || !videoKey) {
      throw createError({ statusCode: 400, message: 'videoId and videoKey are required' })
    }

    const resolvedVisibility: 'private' | 'org' | 'public' =
      visibility === 'public' || visibility === 'org' || visibility === 'private'
        ? visibility
        : 'private'

    const shareToken = randomBytes(16).toString('hex')

    const now = new Date()
    const datePart = now.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const timePart = now.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      .toLowerCase().replace(/\s/g, '')
    const title = `${datePart} ${timePart}`

    const s3Key = `videos/${videoKey}`
    const thumbnailS3Key = thumbnailKey ? `videos/${thumbnailKey}` : null

    const inserted = await tx
      .insertInto('videos')
      .values({
        id: videoId,
        user_id: ctx.userId,
        title,
        s3_key: s3Key,
        thumbnail_url: thumbnailS3Key,
        duration: duration || 0,
        file_size: fileSize ?? null,
        width: width ?? null,
        height: height ?? null,
        share_token: shareToken,
        visibility: resolvedVisibility,
        source,
        original_filename: originalFilename ?? null,
        original_file_size: originalFileSize ?? null,
        compression_ratio: compressionRatio ?? null
      } as never)
      .returningAll()
      .executeTakeFirstOrThrow()

    return {
      success: true,
      videoId: inserted.id,
      shareToken: inserted.share_token
    }
  })
})
