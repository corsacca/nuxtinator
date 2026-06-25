// PATCH /api/videos/share/:token
// Rename a video from its public watch page. The /watch/:token URL is
// org-exempt, so requests arrive with no active-org context — the regular
// `/api/videos/:id` PATCH can't be used here because it reads the org from the
// `X-Active-Org` header the watch page never sends. Mirroring share/[token].get.ts,
// this resolves the video's *own* org from the token via withRecordOrgContext
// (BYPASSRLS lookup + GUC set) so RLS exposes the row, then enforces ownership
// in application code. Only the owner may rename — matching the watch page,
// which shows the edit affordance to owners only.

import { requireAuth } from '#core/server/utils/auth'
import { withRecordOrgContext } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, message: 'Share token is required' })

  const auth = requireAuth(event)

  const body = await readBody(event)
  if (typeof body.title !== 'string' || body.title.trim() === '') {
    throw createError({ statusCode: 400, message: 'Valid title is required' })
  }
  const title = body.title.trim()

  return await withRecordOrgContext(
    event,
    { table: 'videos', id: token, idColumn: 'share_token', validateUuid: false, notFoundMessage: 'Video not found' },
    async (tx) => {
      const existing = await tx.selectFrom('videos')
        .select(['id', 'user_id'])
        .where('share_token', '=', token)
        .executeTakeFirst()
      if (!existing) throw createError({ statusCode: 404, message: 'Video not found' })
      if (existing.user_id !== auth.userId) {
        throw createError({ statusCode: 403, message: 'Forbidden' })
      }

      const updated = await tx.updateTable('videos')
        .set({ title, updated_at: new Date() })
        .where('id', '=', existing.id)
        .returningAll()
        .executeTakeFirstOrThrow()

      return {
        success: true,
        video: {
          id: updated.id,
          title: updated.title,
          updatedAt: updated.updated_at
        }
      }
    }
  )
})
