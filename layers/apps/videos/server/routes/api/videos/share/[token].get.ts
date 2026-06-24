// GET /api/videos/share/:token
// Mostly-public: anyone (authed or not) can fetch a `visibility='public'`
// video. Authenticated owners can additionally fetch their own private/org
// videos via the same URL — useful right after upload when the recorder UI
// hands the user the share link before they've decided whether to publish.
//
// Implementation — the `/watch/:token` URL is org-exempt, so requests arrive
// with no active-org context regardless of who's asking:
//   - Anonymous requests use the regular `db`. RLS exposes only public rows
//     when no `app.current_org` GUC is set (see videos_tenant_read policy), so
//     a private token resolves to "not found" without leaking its existence.
//   - Authenticated requests resolve the video's *own* org from the token via
//     `withRecordOrgContext` (BYPASSRLS lookup + GUC set) so RLS exposes the
//     row, then enforce the owner-or-public check in application code. This is
//     what lets an owner preview their own private/org video from the share
//     link — including right after upload, before they've published it.

import { db } from '#core/server/utils/database'
import { generateDownloadUrl } from '../../../../utils/video-storage'
import { getAuthUser } from '#core/server/utils/auth'
import { withRecordOrgContext } from '#tenant/server'

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
    ? await withRecordOrgContext(
        event,
        { table: 'videos', id: token, idColumn: 'share_token', validateUuid: false, notFoundMessage: 'Video not found' },
        async (tx) => {
          return await tx.selectFrom('videos')
            .select(SELECT_COLS)
            .where('share_token', '=', token)
            .executeTakeFirst()
        }
      )
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
