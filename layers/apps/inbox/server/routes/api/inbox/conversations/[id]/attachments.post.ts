// POST /api/inbox/conversations/:id/attachments
// Multipart { file, draftId }. Uploads an outbound attachment and binds it to
// a DRAFT on this conversation. Attachments must ride a draft (not an already
// queued/sent row) so they can't race the send sweep, and the draft must
// belong to this conversation so an attachment can't be planted on another
// conversation's outgoing mail. The stored object is served download-only
// through the auth proxy; content-type is browser-declared and untrusted.

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { uploadToS3 } from '#core/server/utils/storage'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const form = await readFormData(event).catch(() => null)
  if (!form) {
    throw createError({ statusCode: 400, statusMessage: 'Expected multipart form data' })
  }
  const draftId = form.get('draftId')
  const file = form.get('file')
  // Shape-checked before it reaches a query — a malformed id must be a clean
  // 400, not a Postgres uuid-cast error surfacing as 500.
  if (typeof draftId !== 'string' || !z.string().uuid().safeParse(draftId).success) {
    throw createError({ statusCode: 400, statusMessage: 'draftId must be a valid draft id' })
  }
  if (!(file instanceof File) || !file.name) {
    throw createError({ statusCode: 400, statusMessage: 'file is required' })
  }
  if (INBOX_BLOCKED_EXTENSIONS.test(file.name)) {
    throw createError({ statusCode: 400, statusMessage: 'File type not allowed' })
  }
  if (file.size > INBOX_MAX_ATTACHMENT_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'File exceeds 25 MB' })
  }

  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx) => {
    const draft = await inboxGetMessage(tx, draftId)
    if (!draft || draft.conversation_id !== id || draft.status !== 'draft') {
      throw createError({ statusCode: 404, statusMessage: 'Draft not found' })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const upload = await uploadToS3(buffer, file.name, file.type || 'application/octet-stream', 'private', 'inbox')
    const attachment = await inboxAddAttachment(tx, {
      messageId: draftId,
      s3Key: upload.key,
      filename: file.name,
      contentType: file.type || null,
      sizeBytes: file.size
    })
    return {
      attachment: {
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.content_type,
        sizeBytes: attachment.size_bytes
      }
    }
  })
})
