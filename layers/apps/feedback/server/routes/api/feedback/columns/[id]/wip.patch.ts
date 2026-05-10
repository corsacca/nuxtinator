import { getRouterParam, readBody } from 'h3'
import { sql } from 'kysely'
import { db } from '#core/server/utils/database'
import { requireOperatorAdmin } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  await requireOperatorAdmin(event)

  const body = await readBody(event) ?? {}
  if (!('wip_limit' in body)) {
    throw createError({ statusCode: 400, statusMessage: 'wip_limit is required' })
  }
  const wip = body.wip_limit
  const wipValue = (wip === null || wip === '' || wip === undefined) ? null : Number(wip)
  if (wipValue !== null && (!Number.isFinite(wipValue) || wipValue < 0)) {
    throw createError({ statusCode: 400, statusMessage: 'wip_limit must be a non-negative number or null' })
  }

  const row = await db
    .updateTable('columns')
    .set({ wip_limit: wipValue, updated_at: sql`now()` })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Column not found' })
  return row
})
