// Adds the inbox tables to the host schema by merging into core's global
// `NuxtinatorDatabaseTables` registry (resolution-independent — see core's
// server/database/schema.ts).
import type { ColumnType, Generated } from 'kysely'

// Code-owned-forever vocabulary (mirrored by a CHECK in inbox_001).
export type InboxDirection = 'inbound' | 'outbound'

// Open, zod-validated vocabularies — plain strings in the DB (no CHECKs):
// conversation status: open | pending | closed | spam
// message status:      draft | queued | sent | delivered | failed | received | held
// source:              inbound_email | staff (grows: contact_form)
export type InboxConversationStatus = 'open' | 'pending' | 'closed' | 'spam'
export type InboxMessageStatus = 'draft' | 'queued' | 'sent' | 'delivered' | 'failed' | 'received' | 'held'

export interface InboxConversationsTable {
  id: Generated<string>
  // The counterparty's address identity (crm_channels row). Conversations
  // key on the address registry, never on contact records.
  channel_id: string
  subject: string | null
  status: Generated<string>
  assigned_user_id: string | null
  // 10-byte random hex; drives contact+<token>@ reply routing. Globally
  // unique even in multi mode (see inbox_T002 rationale).
  reply_token: string
  needs_review: Generated<boolean>
  source: string
  // Latest inbound From display name — keeps the list query join-free; the
  // linked-contact chips resolve through crm_contact_channels per detail view.
  counterparty_name: string | null
  last_message_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  last_message_direction: string | null
  // Palette slugs applied to this conversation; names/colours resolve from the
  // per-org tag palette (core_settings namespace 'inbox', key 'tags').
  tags: Generated<string[]>
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

// Reviewer-only metadata attached to an AI-generated draft. Stored in
// inbox_messages.ai_metadata (jsonb); surfaced in the composer's AI review panel
// and never included in the outbound email.
export interface InboxAiDraftMetadata {
  // Faithful English back-translation of the draft (equals the draft when it's
  // already English). Lets an English-only reviewer vet a foreign-language draft.
  gloss: string
  // ISO language code the draft was written in.
  language: string
  // Short labels of grounding pieces that informed the answer.
  sources: string[]
  // Facts the model was unsure about / bracketed placeholders to fill in.
  uncertainty: string[]
  // The resolved model id that produced the draft.
  model: string
}

export interface InboxMessagesTable {
  id: Generated<string>
  conversation_id: string
  direction: InboxDirection
  status: string
  sender_user_id: string | null
  from_email: string | null
  from_name: string | null
  to_email: string | null
  subject: string | null
  body_html: string | null
  body_stripped_html: string | null
  body_text: string | null
  // Inbound: the idempotency/dedupe key (Message-Id or synthesized stand-in).
  // Outbound: filled at send time with the provider's Message-Id so contact
  // replies thread back. NULL while draft/queued (partial unique).
  email_message_id: string | null
  in_reply_to: string | null
  email_references: string | null
  spam_score: string | null
  raw_s3_key: string | null
  authenticated: Generated<boolean>
  auth_result: string | null
  hold_reason: string | null
  failed_reason: string | null
  provider_message_id: string | null
  delivered_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  // Outbound queue bookkeeping — the message row IS the send job.
  attempts: Generated<number>
  next_attempt_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  // AI drafting. ai_generated is the regenerate write-guard (a human draft is
  // never overwritten); ai_metadata is the reviewer-only pack (never emailed).
  ai_generated: Generated<boolean>
  ai_metadata: InboxAiDraftMetadata | null
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface InboxAttachmentsTable {
  id: Generated<string>
  message_id: string
  s3_key: string
  filename: string | null
  content_type: string | null
  size_bytes: number | null
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface InboxBlockedSendersTable {
  id: Generated<string>
  channel_id: string
  created_by: string | null
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
}

// Shared, org-wide reply snippets. Single-body HTML (no per-locale variants
// until core grows i18n). created_by is SET NULL so a snippet survives the
// teammate who authored it.
export interface InboxCannedResponsesTable {
  id: Generated<string>
  title: string
  body_html: Generated<string>
  created_by: string | null
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

// Per-user sending identity: an optional routable alias and an HTML signature.
// One row per user (per org in multi mode).
export interface InboxIdentitiesTable {
  id: Generated<string>
  user_id: string
  alias: string | null
  signature: string | null
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

// Internal notes on a conversation — plain text. author_id null + author_label
// set = a system-authored note (never editable). edited_at NULL until edited.
export interface InboxCommentsTable {
  id: Generated<string>
  conversation_id: string
  author_id: string | null
  author_label: string | null
  body: string
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
  edited_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
}

// Snapshotted external reference content the AI drafter grounds on. Upserted by
// the grounding sync keyed on (source, doc_key) — org-leading in multi mode.
// fetched_at doubles as the cross-instance cache-freshness signal (max per org).
export interface InboxGroundingDocumentsTable {
  id: Generated<string>
  source: string
  doc_key: string
  title: string | null
  body_text: string
  fetched_at: ColumnType<Date, Date | string | undefined, Date | string>
}

// Anonymised Q&A entries grown from resolved threads; active entries ground
// future drafts. source_conversation_id is SET NULL (outlives its thread);
// created_by SET NULL (outlives its author). status is a zod-owned open string.
export interface InboxKnowledgeEntriesTable {
  id: Generated<string>
  question: string
  answer: string
  language: Generated<string>
  source_conversation_id: string | null
  status: Generated<string>
  created_by: string | null
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

declare global {
  interface NuxtinatorDatabaseTables {
    inbox_conversations: InboxConversationsTable
    inbox_messages: InboxMessagesTable
    inbox_attachments: InboxAttachmentsTable
    inbox_blocked_senders: InboxBlockedSendersTable
    inbox_canned_responses: InboxCannedResponsesTable
    inbox_identities: InboxIdentitiesTable
    inbox_comments: InboxCommentsTable
    inbox_grounding_documents: InboxGroundingDocumentsTable
    inbox_knowledge_entries: InboxKnowledgeEntriesTable
  }
}
