// POST /api/videos/share/:token/view
// Mostly-public: bump view_count for a public video, skipping if the
// requester is the owner. Mirrors the lookup mode of share/[token].get.ts —
// authenticated requests resolve the video's own org via withRecordOrgContext
// so RLS exposes it (an owner viewing their own non-public video is a no-op,
// not a 404); anonymous requests use the public-only read.

import { sql } from 'kysely'
import { db } from '#core/server/utils/database'
import { getAuthUser } from '#core/server/utils/auth'
import { withRecordOrgContext } from '#tenant/server'

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
            .select(['user_id', 'visibility'])
            .where('share_token', '=', token)
            .executeTakeFirst()
        }
      )
    : await db.selectFrom('videos')
        .select(['user_id', 'visibility'])
        .where('share_token', '=', token)
        .executeTakeFirst()

  if (!video) throw createError({ statusCode: 404, message: 'Video not found' })

  const isOwner = auth?.userId === video.user_id
  if (video.visibility !== 'public' && !isOwner) {
    throw createError({ statusCode: 403, message: 'This video is private' })
  }

  // Only public videos get counted, and never count the owner's own views.
  // The SQL function itself filters on visibility='public', so a private
  // owner-view becomes a no-op without erroring.
  if (video.visibility === 'public' && !isOwner) {
    await sql`SELECT bump_video_counter(${token}, 'view')`.execute(db)
  }

  return { success: true, counted: video.visibility === 'public' && !isOwner }
})
