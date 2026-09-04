// Message bodies live in Gmail until first open: the source is fetched over
// the account's session, parsed, sanitised, and cached on the row. Attachment
// downloads re-fetch the source and pick the part by index.
import { db } from '#core/server/utils/database'
import type { GmailAttachmentMeta } from '../database/schema'
import { gmailGetAccountById } from './gmail-accounts'
import { gmailExtractAttachment, gmailMakeSnippet, gmailParseSource, gmailRewriteCidUrls } from './gmail-mime'
import { gmailSanitizeHtml } from './gmail-sanitize'
import { gmailRunOnAccountSession } from './gmail-session-manager'
import { gmailRecomputeThreads } from './gmail-sync'
import { gmailJson } from './gmail-json'

export interface GmailMessageBody {
  id: string
  bodyHtml: string | null
  bodyText: string | null
  attachments: GmailAttachmentMeta[]
}

export class GmailBodyUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GmailBodyUnavailable'
  }
}

async function ownedMessage(userId: string, messageId: string) {
  return await db
    .selectFrom('gmail_messages as m')
    .innerJoin('gmail_threads as t', 't.id', 'm.thread_id')
    .select(['m.id', 'm.account_id', 'm.thread_id', 'm.folder', 'm.uid', 'm.body_html', 'm.body_text', 'm.body_fetched_at', 'm.attachments', 'm.snippet'])
    .where('m.id', '=', messageId)
    .where('t.user_id', '=', userId)
    .executeTakeFirst() ?? null
}

async function fetchSource(accountId: string, folder: 'all' | 'trash' | 'spam', uid: number): Promise<Buffer> {
  if (uid <= 0) throw new GmailBodyUnavailable('This message is still being moved. Try again in a moment.')
  const account = await gmailGetAccountById(db, accountId)
  const path = account?.folders?.[folder]
  if (!path) throw new GmailBodyUnavailable('The account is not connected.')
  const source = await gmailRunOnAccountSession(accountId, async (session) => {
    await session.openFolder(path)
    return await session.fetchSource(uid)
  })
  if (!source) throw new GmailBodyUnavailable('Gmail no longer has this message.')
  return source
}

export async function gmailEnsureBody(userId: string, messageId: string): Promise<GmailMessageBody | null> {
  const row = await ownedMessage(userId, messageId)
  if (!row) return null
  if (row.body_fetched_at) {
    return { id: row.id, bodyHtml: row.body_html, bodyText: row.body_text, attachments: row.attachments }
  }
  const source = await fetchSource(row.account_id, row.folder, row.uid)
  const parsed = await gmailParseSource(source)
  const html = parsed.html ? gmailSanitizeHtml(gmailRewriteCidUrls(parsed.html, row.id, parsed.attachments)) : null
  const snippet = row.snippet || gmailMakeSnippet(parsed.text, parsed.html) || ''
  await db
    .updateTable('gmail_messages')
    .set({
      body_html: html || null,
      body_text: parsed.text,
      attachments: gmailJson<GmailAttachmentMeta[]>(parsed.attachments),
      has_attachments: parsed.attachments.some(a => !a.inline),
      snippet,
      body_fetched_at: new Date(),
      updated_at: new Date()
    })
    .where('id', '=', row.id)
    .execute()
  if (snippet !== row.snippet) await gmailRecomputeThreads(db, [row.thread_id])
  return { id: row.id, bodyHtml: html || null, bodyText: parsed.text, attachments: parsed.attachments }
}

export async function gmailFetchAttachment(userId: string, messageId: string, index: number): Promise<{ filename: string | null, contentType: string, content: Buffer } | null> {
  const row = await ownedMessage(userId, messageId)
  if (!row) return null
  const source = await fetchSource(row.account_id, row.folder, row.uid)
  return await gmailExtractAttachment(source, index)
}

export async function gmailFetchMessageSource(userId: string, messageId: string): Promise<Buffer | null> {
  const row = await ownedMessage(userId, messageId)
  if (!row) return null
  return await fetchSource(row.account_id, row.folder, row.uid)
}
