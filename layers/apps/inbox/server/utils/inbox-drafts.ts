// Shared draft lifecycle. Drafts are inbox_messages rows at status='draft',
// SHARED across all staff (no per-user filter): any inbox.send user can load,
// edit, send, or delete any draft on a conversation. Drafts are excluded from
// the thread message list (inboxListMessages) and surfaced separately.
//
// Every mutation is scoped to (id, conversation_id, status='draft') so a draft
// promoted to 'queued' mid-flight can no longer be edited or deleted, and a
// draft can't be reached through another conversation's URL — closing
// edit-after-send races and cross-conversation writes.
import { sql } from 'kysely'
import type { Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import type { InboxAiDraftMetadata } from '../database/schema'
import type { InboxMessageRow } from './inbox-messages'

type Tx = Transaction<Database>

export type InboxDraftRow = InboxMessageRow & { sender_name: string | null }

export async function inboxListDrafts(tx: Tx, conversationId: string): Promise<InboxDraftRow[]> {
  const rows = await tx
    .selectFrom('inbox_messages')
    .leftJoin('users', 'users.id', 'inbox_messages.sender_user_id')
    .selectAll('inbox_messages')
    .select('users.display_name as sender_name')
    .where('inbox_messages.conversation_id', '=', conversationId)
    .where('inbox_messages.status', '=', 'draft')
    .orderBy('inbox_messages.created_at', 'asc')
    .execute()
  return rows as InboxDraftRow[]
}

export async function inboxCreateDraft(tx: Tx, data: {
  conversationId: string
  senderUserId: string
  bodyHtml: string
  bodyText: string
  subject: string | null
  fromEmail?: string | null
}): Promise<InboxMessageRow> {
  return await inboxCreateMessage(tx, {
    conversationId: data.conversationId,
    direction: 'outbound',
    status: 'draft',
    senderUserId: data.senderUserId,
    fromEmail: data.fromEmail ?? null,
    subject: data.subject,
    bodyHtml: data.bodyHtml,
    bodyText: data.bodyText
  })
}

// Update a draft's body (from_email kept when not provided). Returns null when
// no matching draft row exists (already sent, deleted, or wrong conversation).
export async function inboxUpdateDraft(tx: Tx, params: {
  id: string
  conversationId: string
  bodyHtml: string
  bodyText: string
  fromEmail?: string | null
}): Promise<InboxMessageRow | null> {
  const row = await tx
    .updateTable('inbox_messages')
    .set({
      body_html: params.bodyHtml,
      body_text: params.bodyText,
      from_email: sql`COALESCE(${params.fromEmail ?? null}, from_email)`,
      updated_at: new Date()
    })
    .where('id', '=', params.id)
    .where('conversation_id', '=', params.conversationId)
    .where('status', '=', 'draft')
    .returningAll()
    .executeTakeFirst()
  return row ?? null
}

// Create an AI-authored draft: an outbound draft flagged ai_generated with its
// reviewer-only metadata. It's edited/sent through the normal composer path.
export async function inboxCreateAiDraft(tx: Tx, data: {
  conversationId: string
  senderUserId: string
  bodyHtml: string
  bodyText: string
  subject: string | null
  fromEmail?: string | null
  aiMetadata: InboxAiDraftMetadata
}): Promise<InboxMessageRow> {
  return await inboxCreateMessage(tx, {
    conversationId: data.conversationId,
    direction: 'outbound',
    status: 'draft',
    senderUserId: data.senderUserId,
    fromEmail: data.fromEmail ?? null,
    subject: data.subject,
    bodyHtml: data.bodyHtml,
    bodyText: data.bodyText,
    aiGenerated: true,
    aiMetadata: data.aiMetadata
  })
}

// Overwrite an existing AI draft in place (regenerate). Guarded by
// `ai_generated = true` in addition to the draft/conversation scope, so a
// human-written draft is NEVER clobbered — the boolean is the write-guard.
// Returns null when no matching AI draft exists (sent, deleted, human-authored,
// or wrong conversation), and the caller falls through to creating a new one.
export async function inboxUpdateAiDraft(tx: Tx, params: {
  id: string
  conversationId: string
  bodyHtml: string
  bodyText: string
  fromEmail?: string | null
  aiMetadata: InboxAiDraftMetadata
}): Promise<InboxMessageRow | null> {
  const row = await tx
    .updateTable('inbox_messages')
    .set({
      body_html: params.bodyHtml,
      body_text: params.bodyText,
      from_email: sql`COALESCE(${params.fromEmail ?? null}, from_email)`,
      ai_metadata: sql`${JSON.stringify(params.aiMetadata)}::text::jsonb`,
      updated_at: new Date()
    })
    .where('id', '=', params.id)
    .where('conversation_id', '=', params.conversationId)
    .where('status', '=', 'draft')
    .where('ai_generated', '=', true)
    .returningAll()
    .executeTakeFirst()
  return row ?? null
}

export async function inboxDeleteDraft(tx: Tx, id: string, conversationId: string): Promise<boolean> {
  const result = await tx
    .deleteFrom('inbox_messages')
    .where('id', '=', id)
    .where('conversation_id', '=', conversationId)
    .where('status', '=', 'draft')
    .executeTakeFirst()
  return Number(result.numDeletedRows ?? 0) > 0
}

// Promote a draft to a queued send: apply the latest body and flip
// draft→queued atomically. The atomic status guard means two concurrent sends
// of the same draft can't both win. Returns null if it is no longer a draft.
export async function inboxPromoteDraft(tx: Tx, params: {
  id: string
  conversationId: string
  bodyHtml: string
  bodyText: string
}): Promise<InboxMessageRow | null> {
  const row = await tx
    .updateTable('inbox_messages')
    .set({
      status: 'queued',
      body_html: params.bodyHtml,
      body_text: params.bodyText,
      updated_at: new Date()
    })
    .where('id', '=', params.id)
    .where('conversation_id', '=', params.conversationId)
    .where('status', '=', 'draft')
    .returningAll()
    .executeTakeFirst()
  return row ?? null
}
