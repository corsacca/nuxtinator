// GET /api/videos?scope=mine|team
//
// scope=mine (default) — videos uploaded by the current user, all visibilities
// scope=team           — org-shared videos uploaded by anyone in the active org
//
// In multi-tenant mode RLS already scopes the underlying table to the active
// org; the scope param just toggles user_id and visibility filters.

import { withOrgContext } from '#tenant/server'
import { generateDownloadUrl } from '../../../utils/video-storage'

export default defineEventHandler(async (event) => {
  return await withOrgContext(event, { appId: 'videos' }, async (tx, ctx) => {
    const query = getQuery(event)
    const scope = query.scope === 'team' ? 'team' : 'mine'

    let q = tx.selectFrom('videos').selectAll()

    if (scope === 'team') {
      q = q.where('visibility', '=', 'org')
    } else {
      q = q.where('user_id', '=', ctx.userId)
    }

    const rows = await q.orderBy('created_at', 'desc').execute()

    const videos = await Promise.all(rows.map(async (v) => {
      let thumbnailUrl: string | null = null
      if (v.thumbnail_url) {
        try {
          const filename = v.thumbnail_url.split('/').pop()!
          thumbnailUrl = await generateDownloadUrl(filename)
        } catch (err) {
          console.error('Error generating thumbnail URL:', err)
        }
      }
      return {
        id: v.id,
        title: v.title,
        duration: v.duration,
        fileSize: v.file_size,
        width: v.width,
        height: v.height,
        thumbnailUrl,
        shareToken: v.share_token,
        visibility: v.visibility,
        viewCount: v.view_count,
        playCount: v.play_count,
        userId: v.user_id,
        createdAt: v.created_at,
        updatedAt: v.updated_at
      }
    }))

    return { videos }
  })
})
