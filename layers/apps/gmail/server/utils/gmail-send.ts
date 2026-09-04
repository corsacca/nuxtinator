// The outbound sweep: claims due queued drafts, assembles the message
// (quoted history for replies, forwarded content and attachments for
// forwards, staged S3 attachments), sends it over the account's SMTP
// credentials, and records the result. The claim is an atomic
// queued→sending UPDATE, so replicas never send the same draft twice.
import { randomUUID } from 'node:crypto'
import { sql } from 'kysely'
import { db } from '#core/server/utils/database'
import { generateSignedUrl } from '#core/server/utils/storage'
import type { GmailAddress } from '../database/schema'
import { gmailAccountCreds, gmailGetAccountById } from './gmail-accounts'
import { gmailRecordAddresses } from './gmail-addresses'
import { gmailEnsureBody, gmailFetchMessageSource } from './gmail-body'
import { gmailDeleteDraftAttachmentObjects, type GmailDraftRow } from './gmail-drafts'
import { gmailExtractForwardAttachments, gmailHtmlToText } from './gmail-mime'
import { gmailSanitizeOutboundHtml } from './gmail-sanitize'
import { gmailGetTransport } from './gmail-transport-registry'
import type { GmailOutboundAttachment } from './gmail-transport'

const MAX_ATTEMPTS = 3
const RETRY_BACKOFF_SECONDS = [30, 120, 600]
const SWEEP_BATCH = 20

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function textToHtml(text: string | null | undefined): string {
  return `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`
}

function addrLine(list: GmailAddress[]): string {
  return list.map(a => (a.name ? `${escapeHtml(a.name)} &lt;${escapeHtml(a.address)}&gt;` : escapeHtml(a.address))).join(', ')
}

// Cached bodies point inline images at the authenticated proxy; those URLs
// mean nothing to a recipient, so they are dropped from quoted content.
function stripProxiedImages(html: string): string {
  return html.replace(/<img\b[^>]*src=["']\/api\/gmail\/[^"']*["'][^>]*>/gi, '')
}

interface OriginalMessage {
  id: string
  message_id: string | null
  in_reply_to: string | null
  from_name: string | null
  from_addr: string | null
  to_json: GmailAddress[]
  cc_json: GmailAddress[]
  subject: string | null
  internal_date: Date
}

async function originalBodyHtml(userId: string, original: OriginalMessage): Promise<string> {
  try {
    const body = await gmailEnsureBody(userId, original.id)
    if (body?.bodyHtml) return stripProxiedImages(body.bodyHtml)
    if (body?.bodyText) return textToHtml(body.bodyText)
  } catch (err) {
    console.error('[gmail] could not load original body for quoting:', err)
  }
  return ''
}

function quoteBlock(original: OriginalMessage, bodyHtml: string): string {
  const when = new Date(original.internal_date).toUTCString()
  const who = original.from_name ? `${escapeHtml(original.from_name)} &lt;${escapeHtml(original.from_addr)}&gt;` : escapeHtml(original.from_addr)
  return `<br><br><div class="gmail_quote">On ${escapeHtml(when)}, ${who} wrote:<br><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${bodyHtml}</blockquote></div>`
}

function forwardBlock(original: OriginalMessage, bodyHtml: string): string {
  const from = original.from_name ? `${escapeHtml(original.from_name)} &lt;${escapeHtml(original.from_addr)}&gt;` : escapeHtml(original.from_addr)
  return `<br><br><div class="gmail_quote">---------- Forwarded message ---------<br>`
    + `From: ${from}<br>`
    + `Date: ${escapeHtml(new Date(original.internal_date).toUTCString())}<br>`
    + `Subject: ${escapeHtml(original.subject)}<br>`
    + `To: ${addrLine(original.to_json)}<br>`
    + (original.cc_json.length ? `Cc: ${addrLine(original.cc_json)}<br>` : '')
    + `<br>${bodyHtml}</div>`
}

async function stagedAttachments(row: GmailDraftRow): Promise<GmailOutboundAttachment[]> {
  const out: GmailOutboundAttachment[] = []
  for (const a of row.attachments) {
    const url = await generateSignedUrl(a.s3Key, 300)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`attachment ${a.filename} could not be read from storage`)
    out.push({ filename: a.filename, contentType: a.contentType, content: Buffer.from(await res.arrayBuffer()) })
  }
  return out
}

async function sendDraft(row: GmailDraftRow): Promise<string> {
  const account = await gmailGetAccountById(db, row.account_id)
  if (!account) throw new Error('account no longer exists')
  const creds = gmailAccountCreds(account)

  let html = gmailSanitizeOutboundHtml(row.body_html)
  let inReplyTo: string | null = null
  let references: string | null = null
  const attachments = await stagedAttachments(row)

  if (row.reply_to_message_id && row.mode !== 'new') {
    const original = await db
      .selectFrom('gmail_messages')
      .select(['id', 'message_id', 'in_reply_to', 'from_name', 'from_addr', 'to_json', 'cc_json', 'subject', 'internal_date'])
      .where('id', '=', row.reply_to_message_id)
      .executeTakeFirst()
    if (original) {
      const quoted = await originalBodyHtml(row.user_id, original)
      if (row.mode === 'forward') {
        html += forwardBlock(original, quoted)
        try {
          const source = await gmailFetchMessageSource(row.user_id, original.id)
          if (source) attachments.push(...await gmailExtractForwardAttachments(source))
        } catch (err) {
          console.error('[gmail] could not load original attachments for forwarding:', err)
        }
      } else {
        html += quoteBlock(original, quoted)
        inReplyTo = original.message_id
        references = [original.in_reply_to, original.message_id].filter(Boolean).join(' ') || null
      }
    }
  }

  const domain = account.email.split('@')[1] || 'mail.gmail.com'
  const messageId = `<${randomUUID()}@${domain}>`
  await gmailGetTransport().send(creds, {
    from: { name: account.display_name, address: account.email },
    to: row.to_json,
    cc: row.cc_json,
    bcc: row.bcc_json,
    subject: row.subject ?? '',
    html,
    text: gmailHtmlToText(html),
    messageId,
    inReplyTo,
    references,
    attachments
  })
  return messageId
}

export async function gmailRunSendSweep(): Promise<number> {
  const due = await db
    .selectFrom('gmail_drafts')
    .select('id')
    .where('status', '=', 'queued')
    .where('send_after', '<=', sql<Date>`now()`)
    .orderBy('send_after', 'asc')
    .limit(SWEEP_BATCH)
    .execute()
  let sent = 0
  for (const { id } of due) {
    const claimed = await db
      .updateTable('gmail_drafts')
      .set({ status: 'sending', attempts: sql`attempts + 1`, updated_at: new Date() })
      .where('id', '=', id)
      .where('status', '=', 'queued')
      .returningAll()
      .executeTakeFirst()
    if (!claimed) continue
    try {
      const messageId = await sendDraft(claimed)
      await db
        .updateTable('gmail_drafts')
        .set({ status: 'sent', sent_message_id: messageId, sent_at: new Date(), last_error: null, updated_at: new Date() })
        .where('id', '=', id)
        .execute()
      await gmailRecordAddresses(db, claimed.user_id, [...claimed.to_json, ...claimed.cc_json, ...claimed.bcc_json])
      await gmailDeleteDraftAttachmentObjects(claimed.attachments)
      sent++
    } catch (err) {
      const message = (err as Error)?.message ?? 'send failed'
      console.error(`[gmail] send failed for draft ${id}:`, err)
      if (claimed.attempts >= MAX_ATTEMPTS) {
        await db
          .updateTable('gmail_drafts')
          .set({ status: 'failed', last_error: message, updated_at: new Date() })
          .where('id', '=', id)
          .execute()
      } else {
        const backoff = RETRY_BACKOFF_SECONDS[Math.min(claimed.attempts - 1, RETRY_BACKOFF_SECONDS.length - 1)]!
        await db
          .updateTable('gmail_drafts')
          .set({ status: 'queued', send_after: new Date(Date.now() + backoff * 1000), last_error: message, updated_at: new Date() })
          .where('id', '=', id)
          .execute()
      }
    }
  }
  return sent
}
