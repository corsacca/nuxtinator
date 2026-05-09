/**
 * GET /api/v1/feedback?project_id=X — returns feedback cards that the calling
 * user submitted for the given project.
 *
 * No org-membership check — a submitter can always see their own submissions
 * regardless of whether they're a member of the receiving org.
 */
import { getQuery } from 'h3'
import { sql } from 'kysely'
import { requireWidgetAuthUser } from '../../../../utils/widget-auth'
import { withProjectOrgContext } from '#tenant/server'
import { generateSignedUrl } from '#core/server/utils/storage'

const COLUMN_TO_STATUS: Record<string, string> = {
  'FEEDBACK INBOX': 'new',
  'BACKLOG': 'accepted',
  'PLANNING': 'in_progress',
  'BUILDING': 'in_progress',
  'TESTING': 'in_progress',
  'DONE': 'accepted',
  'ARCHIVE': 'rejected'
}

export default defineEventHandler(async (event) => {
  const authUser = requireWidgetAuthUser(event)
  const query = getQuery(event)
  const projectId = typeof query.project_id === 'string' ? query.project_id : ''

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'project_id required' })
  }

  return await withProjectOrgContext(event, projectId, async (tx) => {
    const rows = await tx
      .selectFrom('cards as c')
      .leftJoin('columns as col', 'col.id', 'c.column_id')
      .select([
        'c.id',
        'c.project_id',
        'c.post_meta',
        'c.created_at',
        'c.updated_at',
        'col.name as column_name'
      ])
      .where('c.project_id', '=', projectId)
      .where('c.post_type', '=', 'feedback')
      .where(sql<boolean>`c.post_meta ->> 'submitter_user_id' = ${authUser.userId}`)
      .orderBy('c.created_at', 'desc')
      .limit(100)
      .execute()

    const cardIds = rows.map(r => r.id)
    const attachmentRows = cardIds.length > 0
      ? await tx
        .selectFrom('feedback_attachments')
        .select(['id', 'card_id', 'kind', 'storage_key', 'filename', 'mime_type', 'size_bytes'])
        .where('card_id', 'in', cardIds)
        .orderBy('created_at', 'asc')
        .execute()
      : []

    const attachmentsByCard = new Map<string, Array<{ id: string; kind: string; filename: string; mime_type: string; size_bytes: number; url: string }>>()
    for (const a of attachmentRows) {
      const url = await generateSignedUrl(a.storage_key)
      const list = attachmentsByCard.get(a.card_id) ?? []
      list.push({
        id: a.id,
        kind: a.kind,
        filename: a.filename,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        url
      })
      attachmentsByCard.set(a.card_id, list)
    }

    return rows.map((r) => {
      const meta = (r.post_meta ?? {}) as Record<string, any>
      const status = meta.status ?? COLUMN_TO_STATUS[r.column_name ?? ''] ?? 'new'
      return {
        id: r.id,
        project_id: r.project_id,
        status,
        created_at: r.created_at,
        updated_at: r.updated_at,
        feedback_sub_type: meta.feedback_sub_type ?? 'bug',
        reported_element: meta.reported_element ?? '',
        problem_description: meta.problem_description ?? '',
        suggested_fix: meta.suggested_fix ?? '',
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        page_url: meta.page_url ?? '',
        page_path: meta.page_path ?? '',
        external_reference: meta.external_reference ?? null,
        admin_notes: meta.admin_notes ?? null,
        attachments: attachmentsByCard.get(r.id) ?? []
      }
    })
  })
})
