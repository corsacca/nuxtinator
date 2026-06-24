import { readBody } from 'h3'
import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'
import { logUpdate } from '#core/server/utils/activity-logger'

/**
 * PATCH /api/feedback/cards/bulk-move — apply one triage action to many cards.
 *
 * A thin batch wrapper over the single-card move/PATCH logic: for each id it
 * does the same column move (set column_id + last_moved_at, append a
 * card_column_history row) and/or the same assignee update the per-card
 * endpoints do, inside one org-scoped, permission-gated transaction. No new
 * behaviour — just the loop — so the Signal Clusters dashboard can accept a
 * whole group to a column or reassign it without firing N round-trips.
 *
 * Body: { ids: string[], column_id?: string, assignee?: string | null }
 * At least one of column_id / assignee must be present. Cards outside the
 * caller's org are filtered out by RLS (the WHERE id IN (...) simply won't
 * match them).
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) ?? {}

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0)
    : []
  if (ids.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'ids array is required' })
  }

  const columnId = typeof body.column_id === 'string' && body.column_id ? body.column_id : null
  // assignee is intentionally tri-state: omitted = leave as-is, '' / null =
  // clear, non-empty = set. Mirror the single-card PATCH normalization.
  const hasAssignee = 'assignee' in body
  const assignee = hasAssignee ? (body.assignee || null) : undefined

  if (!columnId && !hasAssignee) {
    throw createError({ statusCode: 400, statusMessage: 'column_id or assignee is required' })
  }

  return await withOrgPermission(event, 'feedback.write', async (tx, ctx) => {
    const updated: string[] = []

    for (const id of ids) {
      const card = await tx
        .selectFrom('cards')
        .select(['id'])
        .where('id', '=', id)
        .executeTakeFirst()

      // RLS already scoped the read to the active org; a miss means the id
      // doesn't belong here, so skip it rather than fail the whole batch.
      if (!card) continue

      const updates: Record<string, any> = { updated_at: sql`now()` }

      if (columnId) {
        updates.column_id = columnId
        updates.last_moved_at = sql`now()`
      }
      if (hasAssignee) {
        updates.assignee = assignee
      }

      await tx
        .updateTable('cards')
        .set(updates)
        .where('id', '=', id)
        .execute()

      if (columnId) {
        await tx
          .insertInto('card_column_history')
          .values({ card_id: id, column_id: columnId })
          .execute()
      }

      logUpdate('cards', id, ctx.userId, {
        bulk: true,
        ...(columnId ? { moved_to_column: columnId } : {}),
        ...(hasAssignee ? { assignee } : {})
      })

      updated.push(id)
    }

    return { updated_ids: updated, count: updated.length }
  })
})
