import { readBody } from 'h3'
import { db } from '#core/server/utils/database'
import { requireOperatorAdmin } from '#tenant/server'

export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)

  const body = await readBody(event) ?? {}
  const draggedId = typeof body.draggedColumnId === 'string' ? body.draggedColumnId : ''
  const targetId = typeof body.targetColumnId === 'string' ? body.targetColumnId : ''

  if (!draggedId || !targetId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'draggedColumnId and targetColumnId are required'
    })
  }

  await db.transaction().execute(async (trx) => {
    const dragged = await trx.selectFrom('columns')
      .select('position').where('id', '=', draggedId).executeTakeFirst()
    const target = await trx.selectFrom('columns')
      .select('position').where('id', '=', targetId).executeTakeFirst()

    if (!dragged || !target) {
      throw createError({ statusCode: 404, statusMessage: 'Column not found' })
    }

    await trx.updateTable('columns').set({ position: target.position })
      .where('id', '=', draggedId).execute()
    await trx.updateTable('columns').set({ position: dragged.position })
      .where('id', '=', targetId).execute()
  })

  const rows = await db.selectFrom('columns').selectAll().orderBy('position', 'asc').execute()
  return rows
})
