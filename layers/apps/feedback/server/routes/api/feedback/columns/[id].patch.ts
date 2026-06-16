import { getRouterParam, readBody } from 'h3'
import { sql } from 'kysely'
import { db } from '#core/server/utils/database'
import { requireOperatorAdmin } from '#tenant/server'

const MANDATORY = new Set(['FEEDBACK INBOX', 'DOING', 'DONE', 'ARCHIVE'])

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const body = await readBody(event) ?? {}

  const existing = await db
    .selectFrom('columns')
    .select(['id', 'name'])
    .where('id', '=', id)
    .executeTakeFirst()

  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Column not found' })

  const updates: Record<string, any> = {}
  if (typeof body.name === 'string' && body.name !== existing.name) {
    if (MANDATORY.has(existing.name)) {
      throw createError({ statusCode: 400, statusMessage: `Cannot rename mandatory column ${existing.name}` })
    }
    // Only operator admins can rename (columns are global state).
    await requireOperatorAdmin(event)
    updates.name = body.name
  }
  if (typeof body.is_collapsed === 'boolean') {
    updates.is_collapsed = body.is_collapsed
  }

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }
  updates.updated_at = sql`now()`

  const row = await db
    .updateTable('columns')
    .set(updates)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst()

  return row
})
