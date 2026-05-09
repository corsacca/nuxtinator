/**
 * POST /api/v1/feedback — public web component submission endpoint.
 *
 * Auth is OPTIONAL. Anonymous users can submit feedback (to reduce friction);
 * they won't be able to see their submission later in "My Submissions".
 * Authenticated users' submissions are tied to their user id so they can
 * track status over time.
 *
 * Org membership is NOT required — anyone with a valid project_id can submit.
 * The receiving org's admin decides in the kanban dashboard whether to accept
 * (→ BACKLOG) or reject (→ ARCHIVE).
 *
 * Accepts both application/json and multipart/form-data (with `payload` JSON
 * part + `screenshot` / `attachments` file parts). Files upload to S3 and
 * record in feedback_attachments linked to the new card.
 */
import { readBody, readMultipartFormData, getHeader } from 'h3'
import { getWidgetAuthUser } from '../../../../utils/widget-auth'
import { withProjectOrgContext } from '#tenant/server'
import { logCreate } from '#core/server/utils/activity-logger'
import { uploadToS3, generateSignedUrl, deleteFromS3 } from '#core/server/utils/storage'

const ALLOWED_SUB_TYPES = ['bug', 'feature_addition', 'feature_change'] as const
type SubType = typeof ALLOWED_SUB_TYPES[number]

const CHAR_CAP = 2000

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/zip'
])

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_BYTES = 25 * 1024 * 1024
const MAX_ATTACHMENTS = 4

function clampString(v: unknown, max = CHAR_CAP): string {
  if (typeof v !== 'string') return ''
  const s = v.trim()
  return s.length > max ? s.slice(0, max) : s
}

function normTags(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((t): t is string => typeof t === 'string')
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, 20)
}

interface IncomingFile {
  kind: 'screenshot' | 'attachment'
  filename: string
  mime: string
  buffer: Buffer
}

function sanitizeFilename(name: string): string {
  const base = String(name || 'upload').split(/[\\/]/).pop() || 'upload'
  return base.slice(0, 200)
}

export default defineEventHandler(async (event) => {
  const authUser = getWidgetAuthUser(event)
  const contentType = (getHeader(event, 'content-type') || '').toLowerCase()
  const isMultipart = contentType.startsWith('multipart/form-data')

  let body: any = {}
  const incomingFiles: IncomingFile[] = []

  if (isMultipart) {
    const parts = await readMultipartFormData(event) || []
    let totalBytes = 0
    let attachmentCount = 0
    let screenshotCount = 0

    for (const part of parts) {
      if (!part.name) continue
      if (part.name === 'payload' && !part.filename) {
        try {
          body = JSON.parse(part.data.toString('utf8'))
        } catch {
          throw createError({ statusCode: 400, statusMessage: 'invalid payload JSON' })
        }
        continue
      }
      if (!part.filename) continue
      const kind: IncomingFile['kind'] = part.name === 'screenshot' ? 'screenshot' : 'attachment'
      const mime = (part.type || 'application/octet-stream').toLowerCase()
      if (!ALLOWED_MIME_TYPES.has(mime)) {
        throw createError({ statusCode: 400, statusMessage: `unsupported file type: ${mime}` })
      }
      if (part.data.length > MAX_FILE_BYTES) {
        throw createError({ statusCode: 400, statusMessage: `file too large: ${part.filename}` })
      }
      totalBytes += part.data.length
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw createError({ statusCode: 400, statusMessage: 'total upload size exceeds 25MB' })
      }
      if (kind === 'screenshot') {
        screenshotCount += 1
        if (screenshotCount > 1) {
          throw createError({ statusCode: 400, statusMessage: 'only one screenshot allowed' })
        }
      } else {
        attachmentCount += 1
        if (attachmentCount > MAX_ATTACHMENTS) {
          throw createError({ statusCode: 400, statusMessage: `too many attachments (max ${MAX_ATTACHMENTS})` })
        }
      }
      incomingFiles.push({
        kind,
        filename: sanitizeFilename(part.filename),
        mime,
        buffer: part.data
      })
    }
  } else {
    body = await readBody(event) ?? {}
  }

  const projectId = typeof body.project_id === 'string' ? body.project_id : ''
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'project_id required' })
  }

  const reported_element = clampString(body.reported_element)
  const problem_description = clampString(body.problem_description)
  const suggested_fix = clampString(body.suggested_fix)
  const submitter_name = clampString(body.submitter_name, 100)

  if (!reported_element) throw createError({ statusCode: 400, statusMessage: 'reported_element required' })
  if (!problem_description) throw createError({ statusCode: 400, statusMessage: 'problem_description required' })
  if (!suggested_fix) throw createError({ statusCode: 400, statusMessage: 'suggested_fix required' })
  if (!authUser && !submitter_name) throw createError({ statusCode: 400, statusMessage: 'submitter_name required' })

  const sub: SubType = (ALLOWED_SUB_TYPES as readonly string[]).includes(body.feedback_sub_type)
    ? body.feedback_sub_type as SubType
    : 'bug'

  // Upload to S3 BEFORE the transaction so a DB hiccup doesn't leave stray
  // attachment rows pointing at S3 blobs we'd then need to GC.
  const uploaded: { kind: IncomingFile['kind']; key: string; filename: string; mime: string; size: number }[] = []
  try {
    for (const f of incomingFiles) {
      const result = await uploadToS3(f.buffer, f.filename, f.mime, 'private')
      uploaded.push({
        kind: f.kind,
        key: result.key,
        filename: f.filename,
        mime: f.mime,
        size: f.buffer.length
      })
    }
  } catch (err) {
    for (const u of uploaded) {
      try { await deleteFromS3(u.key) } catch { /* swallow */ }
    }
    throw err
  }

  const nowIso = new Date().toISOString()

  const postMeta = {
    feedback_sub_type: sub,
    reported_element,
    problem_description,
    suggested_fix,
    tags: normTags(body.tags),
    screenshot_url: typeof body.screenshot_url === 'string' ? body.screenshot_url : '',
    page_url: typeof body.page_url === 'string' ? body.page_url : '',
    page_path: typeof body.page_path === 'string' ? body.page_path : '',
    locale: typeof body.locale === 'string' ? body.locale : '',
    referrer: typeof body.referrer === 'string' ? body.referrer : '',
    client_context: (body.client_context && typeof body.client_context === 'object')
      ? body.client_context
      : {},
    submitter_user_id: authUser?.userId ?? null,
    submitter_email: authUser?.email ?? null,
    submitter_name,
    submitter_anonymous: !authUser,
    submitted_at: nowIso,
    status: 'new',
    has_screenshot: uploaded.some(u => u.kind === 'screenshot'),
    attachment_count: uploaded.filter(u => u.kind === 'attachment').length
  }

  try {
    const result = await withProjectOrgContext(event, projectId, async (tx) => {
      const swimlane = await tx
        .selectFrom('swimlanes')
        .select('id')
        .where('project_id', '=', projectId)
        .where('is_default', '=', true)
        .executeTakeFirst()

      if (!swimlane) {
        throw createError({ statusCode: 500, statusMessage: 'No default swimlane for project' })
      }

      // Columns are global (no RLS) but this read works inside the txn anyway.
      const inboxColumn = await tx
        .selectFrom('columns')
        .select('id')
        .where('name', '=', 'FEEDBACK INBOX')
        .executeTakeFirst()

      if (!inboxColumn) {
        throw createError({ statusCode: 500, statusMessage: 'FEEDBACK INBOX column missing' })
      }

      const card = await tx
        .insertInto('cards')
        .values({
          project_id: projectId,
          swimlane_id: swimlane.id,
          column_id: inboxColumn.id,
          title: reported_element.slice(0, 140),
          post_type: 'feedback',
          post_meta: postMeta
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      const attachmentRows = uploaded.length > 0
        ? await tx
          .insertInto('feedback_attachments')
          .values(uploaded.map(u => ({
            card_id: card.id,
            kind: u.kind,
            storage_key: u.key,
            filename: u.filename,
            mime_type: u.mime,
            size_bytes: u.size
          })))
          .returningAll()
          .execute()
        : []

      return { card, attachmentRows }
    })

    logCreate('cards', result.card.id, authUser?.userId, {
      source: 'feedback_widget',
      project_id: projectId,
      feedback_sub_type: sub,
      anonymous: !authUser,
      attachment_count: result.attachmentRows.length
    })

    const responseAttachments = await Promise.all(result.attachmentRows.map(async (a) => ({
      id: a.id,
      kind: a.kind,
      filename: a.filename,
      mime_type: a.mime_type,
      size_bytes: a.size_bytes,
      url: await generateSignedUrl(a.storage_key)
    })))

    return {
      id: result.card.id,
      status: 'new',
      created_at: result.card.created_at,
      project_id: projectId,
      reported_element,
      problem_description,
      suggested_fix,
      feedback_sub_type: sub,
      tags: postMeta.tags,
      attachments: responseAttachments
    }
  } catch (err) {
    // GC the S3 objects if the DB write failed after uploads succeeded.
    for (const u of uploaded) {
      try { await deleteFromS3(u.key) } catch { /* swallow */ }
    }
    throw err
  }
})
