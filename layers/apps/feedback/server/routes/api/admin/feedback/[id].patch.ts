/**
 * PATCH /api/admin/feedback/:id
 *
 * Operator-admin endpoint to update feedback status, notes, external
 * reference, and tags. Status is written into post_meta so the submitter-
 * facing GET surfaces it regardless of the kanban column the card lives in.
 */
import { readBody } from 'h3'
import { requireOperatorAdmin, withRecordOrgContext } from '#tenant/server'

const VALID_STATUSES = new Set(['new', 'triage_needed', 'in_progress', 'rejected', 'accepted'])

function normTags(v: unknown): string[] | undefined {
  if (v === undefined) return undefined
  if (!Array.isArray(v)) return []
  return v.filter((t): t is string => typeof t === 'string').map(t => t.trim()).filter(Boolean).slice(0, 20)
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireOperatorAdmin(event)

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  // Operator-admin triage. `withRecordOrgContext` resolves the card's org_id
  // via BYPASSRLS adminDb and then opens an RLS-aware transaction with that
  // org's GUC set, so subsequent reads/writes against `cards` succeed.
  // Without this, the autocommit `db` query sees zero rows (no GUC → RLS
  // predicate false) and every triage call 404s.
  return await withRecordOrgContext(event, { table: 'cards', id }, async (tx) => {
    const card = await tx
      .selectFrom('cards')
      .select(['id', 'post_type', 'post_meta'])
      .where('id', '=', id)
      .executeTakeFirst()

    if (!card) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    if (card.post_type !== 'feedback') throw createError({ statusCode: 400, statusMessage: 'Not a feedback card' })

    const body = await readBody(event) ?? {}
    const meta = { ...(card.post_meta as Record<string, any>) }

    if (body.status !== undefined) {
      if (!VALID_STATUSES.has(body.status)) {
        throw createError({ statusCode: 422, statusMessage: `Invalid status: ${body.status}` })
      }
      if (body.status !== meta.status) {
        meta.status = body.status
        meta.status_changed_at = new Date().toISOString()
        meta.status_changed_by_user_id = userId
      }
    }

    if (body.admin_notes !== undefined) {
      meta.admin_notes = typeof body.admin_notes === 'string' ? body.admin_notes.slice(0, 10000) : null
    }

    if (body.external_reference !== undefined) {
      meta.external_reference = typeof body.external_reference === 'string' ? body.external_reference.slice(0, 500) : null
    }

    const tags = normTags(body.tags)
    if (tags !== undefined) meta.tags = tags

    const updated = await tx
      .updateTable('cards')
      .set({ post_meta: meta, updated_at: new Date().toISOString() })
      .where('id', '=', id)
      .returning(['id', 'post_meta', 'updated_at'])
      .executeTakeFirstOrThrow()

    const m = updated.post_meta as Record<string, any>
    return {
      id: updated.id,
      status: m.status ?? 'new',
      admin_notes: m.admin_notes ?? null,
      external_reference: m.external_reference ?? null,
      tags: Array.isArray(m.tags) ? m.tags : [],
      status_changed_at: m.status_changed_at ?? null,
      updated_at: updated.updated_at
    }
  })
})
