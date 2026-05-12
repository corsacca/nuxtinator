// Mail capture helpers. The local MailHog-compatible server in this repo is
// actually Mailpit (same binary protocol on :1025; v1 HTTP API on :8025).
// File name kept as `mailhog.ts` for the conceptual role.
//
// Mailpit API:
//   GET    /api/v1/messages         → { messages: [{ ID, To: [{Address}], ... }] }
//   GET    /api/v1/message/{id}     → { ID, Text, HTML, ... }
//   DELETE /api/v1/messages         → empties the inbox

interface MailpitListItem {
  ID: string
  To: { Address: string, Name?: string }[]
  Subject: string
  Created: string
}

interface MailpitFullMessage {
  ID: string
  To: { Address: string, Name?: string }[]
  Subject: string
  Text: string
  HTML: string
}

export interface CapturedMessage {
  id: string
  to: string[]
  subject: string
  text: string
  html: string
  // Convenience for callers that want to grep without picking text vs html
  body: string
}

function baseUrl(): string {
  return process.env.TEST_MAILHOG_URL || 'http://localhost:8025'
}

async function listMessages(): Promise<MailpitListItem[]> {
  const res = await fetch(`${baseUrl()}/api/v1/messages?limit=100`)
  if (!res.ok) {
    throw new Error(`Mailpit list failed: ${res.status} ${res.statusText} (is Mailpit running on ${baseUrl()}?)`)
  }
  const body = await res.json() as { messages: MailpitListItem[] }
  return body.messages ?? []
}

async function getMessage(id: string): Promise<MailpitFullMessage> {
  const res = await fetch(`${baseUrl()}/api/v1/message/${id}`)
  if (!res.ok) throw new Error(`Mailpit fetch ${id} failed: ${res.status}`)
  return await res.json() as MailpitFullMessage
}

function recipientMatches(item: MailpitListItem, email: string): boolean {
  const target = email.toLowerCase()
  return item.To.some(t => t.Address.toLowerCase() === target)
}

// Poll until a message addressed to `email` appears or timeout elapses.
// Returns the parsed message with both text and html bodies populated.
export async function waitForMailTo(email: string, timeoutMs = 5000): Promise<CapturedMessage> {
  const start = Date.now()
  let lastErr: Error | null = null
  while (Date.now() - start < timeoutMs) {
    try {
      const items = await listMessages()
      const match = items.find(m => recipientMatches(m, email))
      if (match) {
        const full = await getMessage(match.ID)
        return {
          id: full.ID,
          to: full.To.map(t => t.Address),
          subject: full.Subject,
          text: full.Text,
          html: full.HTML,
          body: `${full.Text}\n${full.HTML}`
        }
      }
    } catch (err) {
      lastErr = err as Error
    }
    await new Promise(r => setTimeout(r, 100))
  }
  if (lastErr) throw lastErr
  throw new Error(`No mail addressed to ${email} arrived within ${timeoutMs}ms`)
}

// Pull a query-string param value from any URL in the message body.
// Used for the verification flow: `${siteUrl}/api/auth/verify?token=…`.
export function extractTokenFromBody(body: string, paramName = 'token'): string {
  const re = new RegExp(`[?&]${paramName}=([A-Za-z0-9._\\-]+)`)
  const match = body.match(re)
  if (!match) throw new Error(`No ${paramName} param found in mail body:\n${body.slice(0, 500)}`)
  return match[1]!
}

export async function clearMailhog(): Promise<void> {
  const res = await fetch(`${baseUrl()}/api/v1/messages`, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(`Mailpit clear failed: ${res.status} ${res.statusText}`)
  }
}
