import { getRouterParam, readBody } from 'h3'
import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'
import { logUpdate } from '#core/server/utils/activity-logger'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const body = await readBody(event) ?? {}

  return await withOrgPermission(event, 'feedback.write', async (tx, ctx) => {
    const updates: Record<string, any> = {}
    if (typeof body.name === 'string') updates.name = body.name
    if ('description' in body) updates.description = body.description
    if (typeof body.is_expanded === 'boolean') updates.is_expanded = body.is_expanded
    if (body.post_meta && typeof body.post_meta === 'object') updates.post_meta = body.post_meta

    if (Object.keys(updates).length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    }

    updates.updated_at = sql`now()`

    const row = await tx
      .updateTable('projects')
      .set(updates)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()

    if (!row) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

    logUpdate('projects', id, ctx.userId, { fields: Object.keys(updates) })
    return row
  })
})
