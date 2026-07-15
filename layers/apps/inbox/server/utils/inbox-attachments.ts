// Attachment rows + the intake policy shared by the inbound webhook.
// Binary payloads live in the private S3 bucket under the 'inbox' folder;
// serving always goes through the authenticated proxy route which forces
// Content-Disposition: attachment + octet-stream (a stored-XSS defense —
// signed S3 URLs can't override response headers).
import type { Selectable, Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'

type Tx = Transaction<Database>

export type InboxAttachmentRow = Selectable<Database['inbox_attachments']>

// Executable-ish payloads are dropped at intake, silently (a bounce would be
// backscatter). Everything else is stored and served download-only.
export const INBOX_BLOCKED_EXTENSIONS = /\.(exe|bat|cmd|com|scr|js|jar|vbs|ps1|sh|msi|dll)$/i
export const INBOX_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

export async function inboxAddAttachment(
  tx: Tx,
  data: {
    messageId: string
    s3Key: string
    filename: string | null
    contentType: string | null
    sizeBytes: number | null
  }
): Promise<InboxAttachmentRow> {
  return await tx
    .insertInto('inbox_attachments')
    .values({
      message_id: data.messageId,
      s3_key: data.s3Key,
      filename: data.filename,
      content_type: data.contentType,
      size_bytes: data.sizeBytes
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function inboxGetAttachment(tx: Tx, id: string): Promise<InboxAttachmentRow | null> {
  const row = await tx.selectFrom('inbox_attachments').selectAll().where('id', '=', id).executeTakeFirst()
  return row ?? null
}

// Remove an attachment that belongs to a DRAFT in this conversation. Scoped so
// a sent message's attachments (immutable history) and other conversations'
// attachments can't be deleted. The S3 object is left as an accepted orphan
// (same as a discarded draft — GDPR/org-purge cleanup is a separate concern).
export async function inboxDeleteDraftAttachment(
  tx: Tx,
  attachmentId: string,
  conversationId: string
): Promise<boolean> {
  const result = await tx
    .deleteFrom('inbox_attachments')
    .where('id', '=', attachmentId)
    .where('message_id', 'in', eb => eb
      .selectFrom('inbox_messages')
      .select('id')
      .where('conversation_id', '=', conversationId)
      .where('status', '=', 'draft'))
    .executeTakeFirst()
  return Number(result.numDeletedRows ?? 0) > 0
}

// Attachment rows for one message (outbound re-attach at send time).
export async function inboxListAttachmentsForMessage(tx: Tx, messageId: string): Promise<InboxAttachmentRow[]> {
  return await tx
    .selectFrom('inbox_attachments')
    .selectAll()
    .where('message_id', '=', messageId)
    .orderBy('created_at', 'asc')
    .execute()
}

// Attachment metadata for a whole conversation, keyed by message for the
// thread view. Never exposes s3_key to the client — rows are mapped to proxy
// URLs by the route.
export async function inboxListAttachmentsForConversation(
  tx: Tx,
  conversationId: string
): Promise<InboxAttachmentRow[]> {
  return await tx
    .selectFrom('inbox_attachments')
    .innerJoin('inbox_messages', 'inbox_messages.id', 'inbox_attachments.message_id')
    .selectAll('inbox_attachments')
    .where('inbox_messages.conversation_id', '=', conversationId)
    .orderBy('inbox_attachments.created_at', 'asc')
    .execute()
}
