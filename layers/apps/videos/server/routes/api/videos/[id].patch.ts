// PATCH /api/videos/:id
// Update title and/or visibility on a video. Owner can edit own; only users
// with `videos.moderate` can edit someone else's.

import { withOrgContext } from '#tenant/server'

const ALLOWED_VISIBILITIES = ['private', 'org', 'public'] as const
type Visibility = typeof ALLOWED_VISIBILITIES[number]

export default defineEventHandler(async (event) => {
  return await withOrgContext(event, { appId: 'videos' }, async (tx, ctx) => {
    const id = getRouterParam(event, 'id')
    if (!id) throw createError({ statusCode: 400, message: 'Video id is required' })

    const body = await readBody(event)
    const updates: { title?: string, visibility?: Visibility } = {}

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim() === '') {
        throw createError({ statusCode: 400, message: 'Valid title is required' })
      }
      updates.title = body.title.trim()
    }

    if (body.visibility !== undefined) {
      if (!ALLOWED_VISIBILITIES.includes(body.visibility)) {
        throw createError({ statusCode: 400, message: 'Invalid visibility' })
      }
      updates.visibility = body.visibility
    }

    if (!updates.title && !updates.visibility) {
      throw createError({ statusCode: 400, message: 'No updates provided' })
    }

    const existing = await tx.selectFrom('videos')
      .select(['id', 'user_id'])
      .where('id', '=', id)
      .executeTakeFirst()
    if (!existing) throw createError({ statusCode: 404, message: 'Video not found' })

    const isOwner = existing.user_id === ctx.userId
    if (!isOwner && !ctx.perms.has('videos.moderate')) {
      throw createError({ statusCode: 403, message: 'Forbidden' })
    }

    const updated = await tx.updateTable('videos')
      .set({ ...updates, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow()

    return {
      success: true,
      video: {
        id: updated.id,
        title: updated.title,
        visibility: updated.visibility,
        updatedAt: updated.updated_at
      }
    }
  })
})
