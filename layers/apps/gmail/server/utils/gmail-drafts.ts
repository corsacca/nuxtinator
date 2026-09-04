// Local drafts and the outbound queue. A draft row is the send job: `queued`
// waits out the undo window, the sweep claims it as `sending`, and it ends
// `sent` or `failed`. Attachments are staged in private S3 until sent.
import { sql, type Kysely, type Selectable, type Transaction } from 'kysely'
import { randomUUID } from 'node:crypto'
import type { Database } from '#core/server/database/schema'
import { deleteFromS3, uploadToS3 } from '#core/server/utils/storage'
import type { GmailAddress, GmailDraftAttachment, GmailDraftsTable } from '../database/schema'
import { gmailGetPrefs } from './gmail-prefs'
import { gmailJson } from './gmail-json'

type Db = Kysely<Database> | Transaction<Database>
export type GmailDraftRow = Selectable<GmailDraftsTable>

export const GMAIL_DRAFT_MODES = ['new', 'reply', 'reply_all', 'forward'] as const
export type GmailDraftMode = typeof GMAIL_DRAFT_MODES[number]

// Gmail's outbound attachment ceiling.
export const GMAIL_MAX_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024

export class GmailDraftError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message)
    this.name = 'GmailDraftError'
  }
}

export interface GmailDraftInput {
  accountId: string
  mode: GmailDraftMode
  threadId?: string | null
  replyToMessageId?: string | null
  to?: GmailAddress[]
  cc?: GmailAddress[]
  bcc?: GmailAddress[]
  subject?: string | null
  bodyHtml?: string | null
}

export interface GmailDraftView {
  id: string
  accountId: string
  mode: string
  threadId: string | null
  replyToMessageId: string | null
  to: GmailAddress[]
  cc: GmailAddress[]
  bcc: GmailAddress[]
  subject: string | null
  bodyHtml: string | null
  attachments: { id: string, filename: string, contentType: string, size: number }[]
  status: string
  sendAfter: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export function gmailDraftView(row: GmailDraftRow): GmailDraftView {
  return {
    id: row.id,
    accountId: row.account_id,
    mode: row.mode,
    threadId: row.thread_id,
    replyToMessageId: row.reply_to_message_id,
    to: row.to_json,
    cc: row.cc_json,
    bcc: row.bcc_json,
    subject: row.subject,
    bodyHtml: row.body_html,
    attachments: row.attachments.map(a => ({ id: a.id, filename: a.filename, contentType: a.contentType, size: a.size })),
    status: row.status,
    sendAfter: row.send_after ? new Date(row.send_after).toISOString() : null,
    lastError: row.last_error,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  }
}

function cleanAddresses(list: GmailAddress[] | undefined): GmailAddress[] {
  const out: GmailAddress[] = []
  const seen = new Set<string>()
  for (const a of list ?? []) {
    const address = String(a.address ?? '').trim().toLowerCase()
    if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || seen.has(address)) continue
    seen.add(address)
    out.push({ name: a.name ? String(a.name).trim().slice(0, 200) || null : null, address })
  }
  return out
}

async function ownedDraft(db: Db, userId: string, id: string): Promise<GmailDraftRow | null> {
  return await db.selectFrom('gmail_drafts').selectAll().where('id', '=', id).where('user_id', '=', userId).executeTakeFirst() ?? null
}

async function ownedAccountId(db: Db, userId: string, accountId: string): Promise<string> {
  const a = await db.selectFrom('gmail_accounts').select('id').where('id', '=', accountId).where('user_id', '=', userId).executeTakeFirst()
  if (!a) throw new GmailDraftError(400, 'Unknown account')
  return a.id
}

export async function gmailCreateDraft(tx: Transaction<Database>, userId: string, input: GmailDraftInput): Promise<GmailDraftRow> {
  let accountId = await ownedAccountId(tx, userId, input.accountId)
  let threadId: string | null = null
  let replyToMessageId: string | null = null
  if (input.threadId) {
    const t = await tx.selectFrom('gmail_threads').select(['id', 'account_id']).where('id', '=', input.threadId).where('user_id', '=', userId).executeTakeFirst()
    if (!t) throw new GmailDraftError(404, 'Thread not found')
    threadId = t.id
    // Replies always leave from the account that holds the thread.
    accountId = t.account_id
    if (input.replyToMessageId) {
      const m = await tx.selectFrom('gmail_messages').select('id').where('id', '=', input.replyToMessageId).where('thread_id', '=', t.id).executeTakeFirst()
      if (!m) throw new GmailDraftError(404, 'Message not found')
      replyToMessageId = m.id
    }
  }
  return await tx
    .insertInto('gmail_drafts')
    .values({
      user_id: userId,
      account_id: accountId,
      thread_id: threadId,
      reply_to_message_id: replyToMessageId,
      mode: input.mode,
      to_json: gmailJson(cleanAddresses(input.to)),
      cc_json: gmailJson(cleanAddresses(input.cc)),
      bcc_json: gmailJson(cleanAddresses(input.bcc)),
      subject: input.subject?.slice(0, 998) ?? null,
      body_html: input.bodyHtml ?? null,
      attachments: gmailJson([]),
      status: 'draft',
      created_at: new Date(),
      updated_at: new Date()
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function gmailUpdateDraft(
  tx: Transaction<Database>,
  userId: string,
  id: string,
  patch: Partial<Pick<GmailDraftInput, 'accountId' | 'to' | 'cc' | 'bcc' | 'subject' | 'bodyHtml'>>
): Promise<GmailDraftRow> {
  const row = await ownedDraft(tx, userId, id)
  if (!row) throw new GmailDraftError(404, 'Draft not found')
  if (row.status !== 'draft' && row.status !== 'failed') throw new GmailDraftError(409, 'This draft is being sent')
  const set: Record<string, unknown> = { updated_at: new Date() }
  if (patch.accountId !== undefined && !row.thread_id) set.account_id = await ownedAccountId(tx, userId, patch.accountId)
  if (patch.to !== undefined) set.to_json = gmailJson(cleanAddresses(patch.to))
  if (patch.cc !== undefined) set.cc_json = gmailJson(cleanAddresses(patch.cc))
  if (patch.bcc !== undefined) set.bcc_json = gmailJson(cleanAddresses(patch.bcc))
  if (patch.subject !== undefined) set.subject = patch.subject?.slice(0, 998) ?? null
  if (patch.bodyHtml !== undefined) set.body_html = patch.bodyHtml
  if (row.status === 'failed') {
    set.status = 'draft'
    set.last_error = null
  }
  return await tx.updateTable('gmail_drafts').set(set).where('id', '=', id).returningAll().executeTakeFirstOrThrow()
}

export async function gmailListDrafts(db: Db, userId: string): Promise<GmailDraftRow[]> {
  return await db
    .selectFrom('gmail_drafts')
    .selectAll()
    .where('user_id', '=', userId)
    .where('status', 'in', ['draft', 'queued', 'failed'])
    .orderBy('updated_at', 'desc')
    .execute()
}

export async function gmailGetDraft(db: Db, userId: string, id: string): Promise<GmailDraftRow | null> {
  return await ownedDraft(db, userId, id)
}

export async function gmailDeleteDraft(tx: Transaction<Database>, userId: string, id: string): Promise<boolean> {
  const row = await ownedDraft(tx, userId, id)
  if (!row) return false
  if (row.status === 'sending') throw new GmailDraftError(409, 'This draft is being sent')
  await tx.deleteFrom('gmail_drafts').where('id', '=', id).execute()
  await gmailDeleteDraftAttachmentObjects(row.attachments)
  return true
}

export async function gmailDeleteDraftAttachmentObjects(attachments: GmailDraftAttachment[]): Promise<void> {
  for (const a of attachments) {
    try {
      await deleteFromS3(a.s3Key, 'private')
    } catch (err) {
      console.error('[gmail] attachment cleanup failed:', err)
    }
  }
}

export async function gmailAddDraftAttachment(
  tx: Transaction<Database>,
  userId: string,
  id: string,
  file: { filename: string, contentType: string, content: Buffer }
): Promise<GmailDraftAttachment> {
  const row = await ownedDraft(tx, userId, id)
  if (!row) throw new GmailDraftError(404, 'Draft not found')
  if (row.status !== 'draft' && row.status !== 'failed') throw new GmailDraftError(409, 'This draft is being sent')
  const total = row.attachments.reduce((n, a) => n + a.size, 0) + file.content.length
  if (total > GMAIL_MAX_ATTACHMENT_TOTAL_BYTES) throw new GmailDraftError(413, 'Attachments exceed 25 MB')
  const filename = file.filename.replace(/[\\/\r\n]/g, '_').slice(0, 200) || 'attachment'
  const uploaded = await uploadToS3(file.content, filename, file.contentType || 'application/octet-stream', 'private', `gmail/drafts/${id}`)
  const meta: GmailDraftAttachment = { id: randomUUID(), s3Key: uploaded.key, filename, contentType: file.contentType || 'application/octet-stream', size: file.content.length }
  await tx
    .updateTable('gmail_drafts')
    .set({ attachments: gmailJson([...row.attachments, meta]), updated_at: new Date() })
    .where('id', '=', id)
    .execute()
  return meta
}

export async function gmailRemoveDraftAttachment(tx: Transaction<Database>, userId: string, id: string, attachmentId: string): Promise<void> {
  const row = await ownedDraft(tx, userId, id)
  if (!row) throw new GmailDraftError(404, 'Draft not found')
  const target = row.attachments.find(a => a.id === attachmentId)
  if (!target) throw new GmailDraftError(404, 'Attachment not found')
  await tx
    .updateTable('gmail_drafts')
    .set({ attachments: gmailJson(row.attachments.filter(a => a.id !== attachmentId)), updated_at: new Date() })
    .where('id', '=', id)
    .execute()
  await gmailDeleteDraftAttachmentObjects([target])
}

// Moves a draft into the outbound queue behind the user's undo window.
export async function gmailQueueDraft(tx: Transaction<Database>, userId: string, id: string): Promise<{ sendAfter: Date }> {
  const row = await ownedDraft(tx, userId, id)
  if (!row) throw new GmailDraftError(404, 'Draft not found')
  if (row.status !== 'draft' && row.status !== 'failed') throw new GmailDraftError(409, 'This draft is already queued')
  if (!row.to_json.length && !row.cc_json.length && !row.bcc_json.length) throw new GmailDraftError(400, 'Add at least one recipient')
  const prefs = await gmailGetPrefs(tx, userId)
  const sendAfter = new Date(Date.now() + prefs.undoSendSeconds * 1000)
  await tx
    .updateTable('gmail_drafts')
    .set({ status: 'queued', send_after: sendAfter, attempts: 0, last_error: null, updated_at: new Date() })
    .where('id', '=', id)
    .execute()
  return { sendAfter }
}

// Undo: only succeeds while the sweep has not claimed the row.
export async function gmailUnqueueDraft(tx: Transaction<Database>, userId: string, id: string): Promise<boolean> {
  const res = await tx
    .updateTable('gmail_drafts')
    .set({ status: 'draft', send_after: null, updated_at: new Date() })
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .where('status', '=', 'queued')
    .executeTakeFirst()
  return Number(res.numUpdatedRows) > 0
}

export async function gmailCountQueued(db: Db, userId: string): Promise<number> {
  const r = await db
    .selectFrom('gmail_drafts')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('user_id', '=', userId)
    .where('status', '=', 'queued')
    .executeTakeFirst()
  return r?.n ?? 0
}
