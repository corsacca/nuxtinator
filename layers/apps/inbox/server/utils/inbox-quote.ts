// Quoted-history builders for outbound replies. Gmail-style: newest message
// on top, each prior message as an attributed blockquote, so the contact has
// context for what's being answered (matters when they sent several messages
// or their client doesn't thread). Inbound HTML is sanitized before being
// quoted into the outbound email since it can include untrusted markup.
import { inboxSanitizeEmailHtml } from './inbox-sanitize'

export interface InboxQuoteCandidate {
  direction: string
  from_name: string | null
  from_email: string | null
  body_html: string | null
  body_stripped_html: string | null
  body_text: string | null
  created_at: string | Date
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function quoteAuthor(m: InboxQuoteCandidate, fallbackName: string): string {
  if (m.direction === 'outbound') return m.from_name || fallbackName
  return m.from_name || m.from_email || 'Contact'
}

export function inboxBuildQuotedHtml(messages: InboxQuoteCandidate[], fallbackName: string): string {
  if (messages.length === 0) return ''
  let out = '<br><br>'
  for (const m of [...messages].reverse()) {
    const when = new Date(m.created_at).toUTCString()
    const body = inboxSanitizeEmailHtml(m.body_stripped_html || m.body_html || (m.body_text || '').replace(/\n/g, '<br>'))
    out += `<blockquote style="margin:0 0 0 0.8ex;border-left:2px solid #ccc;padding-left:1ex;color:#555;">`
    out += `<div style="font-size:12px;color:#888;margin-bottom:4px;">On ${escapeHtml(when)}, ${escapeHtml(quoteAuthor(m, fallbackName))} wrote:</div>`
    out += body
    out += `</blockquote>`
  }
  return out
}

export function inboxBuildQuotedText(messages: InboxQuoteCandidate[], fallbackName: string): string {
  if (messages.length === 0) return ''
  let out = '\n\n'
  for (const m of [...messages].reverse()) {
    const when = new Date(m.created_at).toUTCString()
    const body = m.body_text || (m.body_stripped_html || m.body_html || '').replace(/<[^>]*>/g, '')
    const quoted = body.split('\n').map((l: string) => '> ' + l).join('\n')
    out += `On ${when}, ${quoteAuthor(m, fallbackName)} wrote:\n${quoted}\n\n`
  }
  return out
}
