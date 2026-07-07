// Message service. Two invariants live here:
//
// Idempotency — `inboxCreateMessageIfNew` claims a message by its
// email_message_id via a bare ON CONFLICT DO NOTHING (never a named target:
// the unique index is global in single mode but org-leading in multi mode).
// Null return = another delivery already persisted this message.
//
// Send queue — an outbound message with status 'queued' IS the send job; the
// sweep claims it with `inboxClaimForSend` (an atomic queued→sent UPDATE), so
// a concurrent or re-run sweep can't double-send. A *confirmed* provider
// failure releases the claim back to 'queued' with backoff
// (`inboxReleaseForRetry`); a crash mid-send leaves it 'sent' — at-most-once:
// the reply may be lost, but is never double-sent.
import { sql } from 'kysely'
import type { Selectable, Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'

type Tx = Transaction<Database>

export type InboxMessageRow = Selectable<Database['inbox_messages']>

export const INBOX_MESSAGE_STATUSES = ['draft', 'queued', 'sent', 'delivered', 'failed', 'received', 'held'] as const

export const INBOX_SEND_MAX_ATTEMPTS = 3

export interface InboxCreateMessageData {
  conversationId: string
  direction: 'inbound' | 'outbound'
  status: string
  senderUserId?: string | null
  fromEmail?: string | null
  fromName?: string | null
  toEmail?: string | null
  subject?: string | null
  bodyHtml?: string | null
  bodyStrippedHtml?: string | null
  bodyText?: string | null
  emailMessageId?: string | null
  inReplyTo?: string | null
  emailReferences?: string | null
  spamScore?: number | null
  authenticated?: boolean
  authResult?: string | null
  holdReason?: string | null
}

function toRowValues(data: InboxCreateMessageData) {
  return {
    conversation_id: data.conversationId,
    direction: data.direction,
    status: data.status,
    sender_user_id: data.senderUserId ?? null,
    from_email: data.fromEmail ?? null,
    from_name: data.fromName ?? null,
    to_email: data.toEmail ?? null,
    subject: data.subject ?? null,
    body_html: data.bodyHtml ?? null,
    body_stripped_html: data.bodyStrippedHtml ?? null,
    body_text: data.bodyText ?? null,
    email_message_id: data.emailMessageId ?? null,
    in_reply_to: data.inReplyTo ?? null,
    email_references: data.emailReferences ?? null,
    spam_score: data.spamScore === null || data.spamScore === undefined ? null : String(data.spamScore),
    authenticated: data.authenticated ?? false,
    auth_result: data.authResult ?? null,
    hold_reason: data.holdReason ?? null
  }
}

// Plain insert — for outbound rows (queued/draft) whose email_message_id is
// NULL until the provider assigns one at send time.
export async function inboxCreateMessage(tx: Tx, data: InboxCreateMessageData): Promise<InboxMessageRow> {
  return await tx
    .insertInto('inbox_messages')
    .values(toRowValues(data))
    .returningAll()
    .executeTakeFirstOrThrow()
}

// Insert that atomically no-ops when a row with the same email_message_id
// already exists — returns null in that case (a duplicate delivery). Pass a
// non-null emailMessageId (synthesize one when the mail has no Message-Id),
// otherwise NULLs never conflict and every retry would insert.
export async function inboxCreateMessageIfNew(tx: Tx, data: InboxCreateMessageData): Promise<InboxMessageRow | null> {
  const row = await tx
    .insertInto('inbox_messages')
    .values(toRowValues(data))
    .onConflict(oc => oc.doNothing())
    .returningAll()
    .executeTakeFirst()
  return row ?? null
}

export async function inboxGetMessage(tx: Tx, id: string): Promise<InboxMessageRow | null> {
  const row = await tx.selectFrom('inbox_messages').selectAll().where('id', '=', id).executeTakeFirst()
  return row ?? null
}

// Hard-delete a message row. Used to release a dedupe claim when artifact
// persistence fails, so the provider's redelivery re-inserts and re-runs
// persistence instead of dedup-skipping a half-stored message.
export async function inboxDeleteMessage(tx: Tx, id: string): Promise<boolean> {
  const result = await tx.deleteFrom('inbox_messages').where('id', '=', id).executeTakeFirst()
  return Number(result.numDeletedRows ?? 0) > 0
}

export async function inboxFindMessageByEmailMessageId(tx: Tx, messageId: string): Promise<InboxMessageRow | null> {
  if (!messageId) return null
  const row = await tx
    .selectFrom('inbox_messages')
    .selectAll()
    .where('email_message_id', '=', messageId)
    .executeTakeFirst()
  return row ?? null
}

// Find the conversation a referenced message belongs to (threading fallback
// when no reply token). Matches either email_message_id or
// provider_message_id: a contact replying to our outbound references the
// provider's id. The ids are attacker-controlled — the caller MUST verify the
// sender belongs to the matched conversation's channel before threading into
// it (anti thread-grafting).
export async function inboxFindConversationByMessageIds(tx: Tx, messageIds: string[]): Promise<string | null> {
  const ids = messageIds.filter(Boolean)
  if (ids.length === 0) return null
  const row = await tx
    .selectFrom('inbox_messages')
    .select('conversation_id')
    .where(eb => eb.or([
      eb('email_message_id', 'in', ids),
      eb('provider_message_id', 'in', ids)
    ]))
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst()
  return row?.conversation_id ?? null
}

// Most recent *received* inbound message — the reply recipient and the
// In-Reply-To / References anchor for outbound replies. Filtered to
// status='received' so a held message can never become the reply target or
// thread anchor: a held sender reached the thread with a valid reply token
// but a From that doesn't belong to the conversation's channel, so replying
// to it would redirect staff mail (and leak the quoted history) to that
// sender.
export async function inboxGetLastInbound(tx: Tx, conversationId: string): Promise<InboxMessageRow | null> {
  const row = await tx
    .selectFrom('inbox_messages')
    .selectAll()
    .where('conversation_id', '=', conversationId)
    .where('direction', '=', 'inbound')
    .where('status', '=', 'received')
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst()
  return row ?? null
}

// Messages for the thread view (excludes drafts). Includes the staff sender's
// display name (NULL for inbound) so the UI can show who sent each reply.
export async function inboxListMessages(
  tx: Tx,
  conversationId: string
): Promise<(InboxMessageRow & { sender_name: string | null })[]> {
  const rows = await tx
    .selectFrom('inbox_messages')
    .leftJoin('users', 'users.id', 'inbox_messages.sender_user_id')
    .selectAll('inbox_messages')
    .select('users.display_name as sender_name')
    .where('inbox_messages.conversation_id', '=', conversationId)
    .where('inbox_messages.status', '!=', 'draft')
    .orderBy('inbox_messages.created_at', 'asc')
    .execute()
  return rows as (InboxMessageRow & { sender_name: string | null })[]
}

// Atomically claim a queued message for sending (queued → sent), returning
// the row only to the winner.
export async function inboxClaimForSend(tx: Tx, id: string): Promise<InboxMessageRow | null> {
  const row = await tx
    .updateTable('inbox_messages')
    .set({ status: 'sent', attempts: sql`attempts + 1`, updated_at: new Date() })
    .where('id', '=', id)
    .where('status', '=', 'queued')
    .returningAll()
    .executeTakeFirst()
  return row ?? null
}

// Mark an outbound message sent and store the provider's message-id — also as
// email_message_id (when unset) so the contact's reply threads back to it.
export async function inboxMarkSent(tx: Tx, id: string, providerMessageId?: string): Promise<void> {
  await tx
    .updateTable('inbox_messages')
    .set({
      status: 'sent',
      provider_message_id: sql`COALESCE(${providerMessageId ?? null}, provider_message_id)`,
      email_message_id: sql`COALESCE(email_message_id, ${providerMessageId ?? null})`,
      updated_at: new Date()
    })
    .where('id', '=', id)
    .execute()
}

// Release a claimed message after a *confirmed* provider failure: back to
// 'queued' with exponential backoff, or 'failed' once attempts are exhausted.
// (attempts was already bumped by the claim.)
export async function inboxReleaseForRetry(tx: Tx, row: InboxMessageRow, error: string): Promise<void> {
  if (row.attempts >= INBOX_SEND_MAX_ATTEMPTS) {
    await tx
      .updateTable('inbox_messages')
      .set({ status: 'failed', failed_reason: error, updated_at: new Date() })
      .where('id', '=', row.id)
      .execute()
    return
  }
  const backoffMinutes = 2 ** row.attempts // 2, 4, 8…
  await tx
    .updateTable('inbox_messages')
    .set({
      status: 'queued',
      failed_reason: error,
      next_attempt_at: sql<Date>`now() + (${backoffMinutes} * interval '1 minute')`,
      updated_at: new Date()
    })
    .where('id', '=', row.id)
    .execute()
}

export async function inboxMarkMessageFailed(tx: Tx, id: string, reason: string): Promise<void> {
  await tx
    .updateTable('inbox_messages')
    .set({ status: 'failed', failed_reason: reason, updated_at: new Date() })
    .where('id', '=', id)
    .execute()
}

// The send sweep's work list for one org scope: queued messages whose
// next_attempt_at has passed (or was never set).
export async function inboxListDueQueued(tx: Tx, limit = 20): Promise<InboxMessageRow[]> {
  return await tx
    .selectFrom('inbox_messages')
    .selectAll()
    .where('status', '=', 'queued')
    .where(eb => eb.or([
      eb('next_attempt_at', 'is', null),
      eb('next_attempt_at', '<=', sql<Date>`now()`)
    ]))
    .orderBy('created_at', 'asc')
    .limit(limit)
    .execute()
}

// Update delivery state by the provider's message-id (used by the delivery
// webhook). Matches provider_message_id or email_message_id, ignoring angle
// brackets.
export async function inboxMarkDeliveryByProviderId(
  tx: Tx,
  providerMessageId: string,
  status: 'delivered' | 'failed',
  extra: { failedReason?: string, deliveredAt?: Date } = {}
): Promise<InboxMessageRow | null> {
  const normalized = providerMessageId.replace(/^<|>$/g, '')
  const row = await tx
    .updateTable('inbox_messages')
    .set({
      status,
      failed_reason: sql`COALESCE(${extra.failedReason ?? null}, failed_reason)`,
      delivered_at: sql`COALESCE(${extra.deliveredAt ?? null}, delivered_at)`,
      updated_at: new Date()
    })
    .where('direction', '=', 'outbound')
    .where(sql<boolean>`(
      replace(replace(provider_message_id, '<', ''), '>', '') = ${normalized}
      OR replace(replace(email_message_id, '<', ''), '>', '') = ${normalized}
    )`)
    .returningAll()
    .executeTakeFirst()
  return row ?? null
}
