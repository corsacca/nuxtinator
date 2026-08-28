// POST /api/videos/share/:token/play
// Mostly-public: bump play_count when a viewer finishes most of a video.
// Access mirrors share/[token].get.ts (public / owner / org member) —
// authenticated requests resolve the video's own org via withRecordOrgContext
// so RLS exposes it; anonymous requests use the public-only read. Public and
// org plays count via the `bump_video_counter` SQL function (SECURITY DEFINER
// under tenancy so the no-GUC path can write past the RLS write policy).

import { sql } from 'kysely'
import { db } from '#core/server/utils/database'
import { getAuthUser } from '#core/server/utils/auth'
import { withRecordOrgContext, isActiveOrgMember } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, message: 'Share token is required' })

  const auth = getAuthUser(event)

  const { video, isOrgMember } = auth
    ? await withRecordOrgContext(
        event,
        { table: 'videos', id: token, idColumn: 'share_token', validateUuid: false, notFoundMessage: 'Video not found' },
        async (tx) => {
          const video = await tx.selectFrom('videos')
            .select(['user_id', 'visibility'])
            .where('share_token', '=', token)
            .executeTakeFirst()
          const isOrgMember = video ? await isActiveOrgMember(tx, auth.userId) : false
          return { video, isOrgMember }
        }
      )
    : {
        video: await db.selectFrom('videos')
          .select(['user_id', 'visibility'])
          .where('share_token', '=', token)
          .executeTakeFirst(),
        isOrgMember: false
      }

  if (!video) throw createError({ statusCode: 404, message: 'Video not found' })

  const isOwner = auth?.userId === video.user_id
  const canView = video.visibility === 'public' || isOwner
    || (video.visibility === 'org' && isOrgMember)
  if (!canView) {
    throw createError({ statusCode: 403, message: 'This video is private' })
  }

  if (video.visibility === 'public' || video.visibility === 'org') {
    await sql`SELECT bump_video_counter(${token}, 'play')`.execute(db)
  }

  return { success: true }
})
