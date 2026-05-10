// GET /api/videos/share/:token
// Mostly-public: anyone (authed or not) can fetch a `visibility='public'`
// video. Authenticated owners can additionally fetch their own private/org
// videos via the same URL — useful right after upload when the recorder UI
// hands the user the share link before they've decided whether to publish.
//
// Implementation:
//   - Anonymous requests use the regular `db`. RLS only exposes public rows
//     when no `app.current_org` GUC is set (see videos_tenant_read policy).
//   - Authenticated requests run inside the user's tenant context so the
//     SELECT can return rows scoped to the active org. The handler then
//     enforces the owner-or-public check in application code.

import { db } from '#core/server/utils/database'
import { generateDownloadUrl } from '../../../../utils/video-storage'
import { getAuthUser } from '#core/server/utils/auth'
import { withOrgContext } from '#tenant/server'

const SELECT_COLS = [
  'id', 'user_id', 'title', 's3_key', 'duration', 'file_size',
  'width', 'height', 'thumbnail_url', 'visibility',
  'view_count', 'play_count', 'created_at'
] as const

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, message: 'Share token is required' })

  const auth = getAuthUser(event)

  const video = auth
    ? await withOrgContext(event, async (tx) => {
        return await tx.selectFrom('videos')
          .select(SELECT_COLS)
          .where('share_token', '=', token)
          .executeTakeFirst()
      })
    : await db.selectFrom('videos')
        .select(SELECT_COLS)
        .where('share_token', '=', token)
        .executeTakeFirst()

  if (!video) throw createError({ statusCode: 404, message: 'Video not found' })

  const isOwner = auth?.userId === video.user_id
  if (video.visibility !== 'public' && !isOwner) {
    throw createError({ statusCode: 403, message: 'This video is private' })
  }

  const filename = video.s3_key.split('/').pop()!
  const videoUrl = await generateDownloadUrl(filename)

  return {
    success: true,
    videoId: video.id,
    title: video.title,
    duration: video.duration,
    videoUrl,
    isOwner,
    viewCount: video.view_count,
    playCount: video.play_count
  }
})
