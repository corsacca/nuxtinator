// Adds the gmail tables to the host schema by merging into core's global
// `NuxtinatorDatabaseTables` registry (resolution-independent — see core's
// server/database/schema.ts).
//
// Every table is keyed on the owning user, never on an org: a connected
// mailbox is personal and follows the user across every org they belong to.
// No table carries org_id or RLS, so the background sync (which runs with no
// request and no org GUC) reads and writes them directly.
import type { ColumnType, Generated } from 'kysely'

export type GmailFolderKey = 'all' | 'trash' | 'spam'

// One IMAP mailbox path per role, discovered from the SPECIAL-USE attributes
// at connect time (Gmail localises the names — "All Mail" is
// "Alle Nachrichten" on a German account — so paths are never assumed).
export interface GmailFolderPaths {
  all: string
  trash: string
  spam: string
  sent: string | null
  drafts: string | null
}

export interface GmailFolderSyncState {
  uidValidity: string | null
  // Highest UID already mirrored; new mail is `lastUid+1:*`.
  lastUid: number
  // CONDSTORE cursor for flag/label changes (`CHANGEDSINCE`).
  highestModseq: string | null
}

export interface GmailSyncState {
  all?: GmailFolderSyncState
  trash?: GmailFolderSyncState
  spam?: GmailFolderSyncState
  // The historical backfill walks All Mail newest-first in pages; this is the
  // lowest UID reached so far (null = not started, 0 = done).
  backfillFloor?: number | null
  // Wall-clock stamp of the last successful reconciliation pass.
  reconciledAt?: string | null
}

export interface GmailAddress {
  name: string | null
  address: string
}

// Attachment metadata parsed from the message on first open. `index` is the
// attachment's position in the parsed MIME tree and is the download key
// (the source is re-fetched and re-parsed on download).
export interface GmailAttachmentMeta {
  index: number
  filename: string | null
  contentType: string
  size: number
  cid: string | null
  inline: boolean
}

// Outbound attachment staged in private S3 until the send sweep picks the
// draft up; deleted after a successful send.
export interface GmailDraftAttachment {
  id: string
  s3Key: string
  filename: string
  contentType: string
  size: number
}

export interface GmailAccountsTable {
  id: Generated<string>
  user_id: string
  email: string
  display_name: string | null
  signature_html: string | null
  // Google app password, AES-256-GCM via core's secret-crypto.
  app_password_enc: string
  // Open vocabulary: connecting | active | error
  status: Generated<string>
  last_error: string | null
  folders: GmailFolderPaths | null
  sync_state: Generated<GmailSyncState>
  backfill_done: Generated<boolean>
  last_sync_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  // Sync-session lease: which process owns the IMAP session and until when.
  lease_holder: string | null
  lease_expires_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface GmailLabelsTable {
  id: Generated<string>
  account_id: string
  // IMAP mailbox path; for user labels this is also the X-GM-LABELS value.
  path: string
  name: string
  special_use: string | null
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface GmailThreadsTable {
  id: Generated<string>
  account_id: string
  user_id: string
  gm_thrid: string
  subject: string | null
  snippet: string | null
  first_message_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  last_message_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  // List ordering key: greatest(last_message_at, woken_at) so a woken thread
  // surfaces at the top of the inbox.
  sort_at: ColumnType<Date, Date | string, Date | string>
  message_count: Generated<number>
  unread_count: Generated<number>
  trash_count: Generated<number>
  spam_count: Generated<number>
  has_attachments: Generated<boolean>
  in_inbox: Generated<boolean>
  is_starred: Generated<boolean>
  is_important: Generated<boolean>
  has_sent: Generated<boolean>
  labels: Generated<string[]>
  participants: Generated<GmailAddress[]>
  snoozed_until: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  woken_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface GmailMessagesTable {
  id: Generated<string>
  account_id: string
  thread_id: string
  // Gmail's stable ids (X-GM-MSGID / X-GM-THRID). Unsigned 64-bit upstream,
  // stored as text so they can never overflow bigint.
  gm_msgid: string
  gm_thrid: string
  folder: GmailFolderKey
  uid: number
  message_id: string | null
  in_reply_to: string | null
  from_name: string | null
  from_addr: string | null
  to_json: Generated<GmailAddress[]>
  cc_json: Generated<GmailAddress[]>
  bcc_json: Generated<GmailAddress[]>
  reply_to_json: Generated<GmailAddress[]>
  subject: string | null
  snippet: string | null
  internal_date: ColumnType<Date, Date | string, Date | string>
  size_bytes: number | null
  labels: Generated<string[]>
  flags: Generated<string[]>
  has_attachments: Generated<boolean>
  // BODYSTRUCTURE part paths of the first text/plain and text/html parts; the
  // snippet fetch downloads a bounded prefix of one of them.
  text_part: string | null
  html_part: string | null
  body_html: string | null
  body_text: string | null
  body_fetched_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  attachments: Generated<GmailAttachmentMeta[]>
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface GmailSnoozesTable {
  id: Generated<string>
  thread_id: string
  user_id: string
  wake_at: ColumnType<Date, Date | string, Date | string>
  woke_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  // timer | reply | manual
  wake_reason: string | null
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
}

// A draft row IS the send job: `queued` rows wait for `send_after` (the undo
// window), the sweep claims them (`sending`), and they end `sent` or `failed`.
export interface GmailDraftsTable {
  id: Generated<string>
  user_id: string
  account_id: string
  thread_id: string | null
  reply_to_message_id: string | null
  // new | reply | reply_all | forward
  mode: Generated<string>
  to_json: Generated<GmailAddress[]>
  cc_json: Generated<GmailAddress[]>
  bcc_json: Generated<GmailAddress[]>
  subject: string | null
  body_html: string | null
  attachments: Generated<GmailDraftAttachment[]>
  // draft | queued | sending | sent | failed
  status: Generated<string>
  send_after: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  attempts: Generated<number>
  last_error: string | null
  sent_message_id: string | null
  sent_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

// Addresses seen in mirrored headers, per user, for compose autocomplete.
export interface GmailAddressesTable {
  id: Generated<string>
  user_id: string
  email: string
  name: string | null
  seen_count: Generated<number>
  last_seen_at: ColumnType<Date, Date | string | undefined, Date | string>
}

// Per-user preference overrides only; defaults live in code
// (server/utils/gmail-prefs.ts).
export interface GmailUserPrefsTable {
  user_id: string
  prefs: Generated<Record<string, unknown>>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

declare global {
  interface NuxtinatorDatabaseTables {
    gmail_accounts: GmailAccountsTable
    gmail_labels: GmailLabelsTable
    gmail_threads: GmailThreadsTable
    gmail_messages: GmailMessagesTable
    gmail_snoozes: GmailSnoozesTable
    gmail_drafts: GmailDraftsTable
    gmail_addresses: GmailAddressesTable
    gmail_user_prefs: GmailUserPrefsTable
  }
}
