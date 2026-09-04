// MIME parsing for message bodies and attachments (mailparser), plus the
// snippet and text helpers the sync engine and list views rely on.
import { simpleParser } from 'mailparser'
import type { GmailAttachmentMeta } from '../database/schema'

export interface GmailParsedMessage {
  html: string | null
  text: string | null
  attachments: GmailAttachmentMeta[]
}

export async function gmailParseSource(source: Buffer): Promise<GmailParsedMessage> {
  const parsed = await simpleParser(source)
  const attachments: GmailAttachmentMeta[] = parsed.attachments.map((a, index) => ({
    index,
    filename: a.filename ?? null,
    contentType: a.contentType || 'application/octet-stream',
    size: a.size ?? a.content?.length ?? 0,
    cid: a.cid ?? null,
    inline: a.contentDisposition === 'inline' || !!a.related
  }))
  const html = typeof parsed.html === 'string' && parsed.html.trim() ? parsed.html : (parsed.textAsHtml || null)
  return { html, text: parsed.text ?? null, attachments }
}

export async function gmailExtractAttachment(source: Buffer, index: number): Promise<{ filename: string | null, contentType: string, content: Buffer } | null> {
  const parsed = await simpleParser(source)
  const a = parsed.attachments[index]
  if (!a) return null
  return { filename: a.filename ?? null, contentType: a.contentType || 'application/octet-stream', content: a.content }
}

// Every non-inline attachment of a message, for forwarding.
export async function gmailExtractForwardAttachments(source: Buffer): Promise<{ filename: string, contentType: string, content: Buffer, cid?: string }[]> {
  const parsed = await simpleParser(source)
  return parsed.attachments
    .filter(a => !a.related)
    .map(a => ({ filename: a.filename || 'attachment', contentType: a.contentType || 'application/octet-stream', content: a.content }))
}

export function gmailHtmlToText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<\s*(?:style|script)[^>]*>[\s\S]*?<\s*\/\s*(?:style|script)\s*>/gi, ' ')
    .replace(/<\s*(?:br\s*\/?|\/(?:p|h[1-6]|li|div|tr|blockquote))\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
}

// The list-row preview: the first 200 characters of the message's own text,
// with quoted history and the "On … wrote:" lead-in dropped.
export function gmailMakeSnippet(text: string | null | undefined, html?: string | null): string | null {
  let src = (text && text.trim()) ? text : gmailHtmlToText(html)
  if (!src.trim()) return null
  src = src.replace(/\r/g, '')
  const lines: string[] = []
  for (const line of src.split('\n')) {
    if (/^\s*>/.test(line)) continue
    if (/^On .{5,200} wrote:\s*$/.test(line.trim())) break
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break
    lines.push(line)
  }
  const flat = lines.join(' ').replace(/\s+/g, ' ').trim()
  if (!flat) return null
  return flat.length > 200 ? `${flat.slice(0, 199)}…` : flat
}

// Rewrites `cid:` image references to the message's attachment route so
// inline images render from the authenticated proxy.
export function gmailRewriteCidUrls(html: string, messageId: string, attachments: GmailAttachmentMeta[]): string {
  if (!attachments.length) return html
  const byCid = new Map<string, number>()
  for (const a of attachments) {
    if (a.cid) byCid.set(a.cid.replace(/^<|>$/g, ''), a.index)
  }
  if (!byCid.size) return html
  return html.replace(/(src|background)\s*=\s*(["']?)cid:([^"'\s>]+)\2/gi, (whole, attr: string, quote: string, cid: string) => {
    const index = byCid.get(cid.replace(/^<|>$/g, ''))
    if (index === undefined) return whole
    return `${attr}="/api/gmail/messages/${messageId}/attachments/${index}"`
  })
}
