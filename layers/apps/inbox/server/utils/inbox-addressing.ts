// Inbox email addressing.
//
// Contacts reply to a plain per-conversation address: `contact+<token>@<domain>`.
// The parser tolerates additional dot-separated segments after the token
// (`contact+<token>.<...>@`) so signed staff reply-by-email addresses can be
// introduced later without changing the address grammar — today only the
// first segment (the conversation reply token) is used.
//
// Everything is lowercased and compared case-insensitively, so MTAs that
// case-fold the local part don't break matching.

export interface InboxParsedRecipient {
  localPart: string // full local part, lowercased (e.g. 'contact+abc123')
  domain: string // lowercased
  base: string // local part before '+' (e.g. 'contact')
  token: string | null // conversation reply token
}

function getLocalAndDomain(address: string): { local: string, domain: string } | null {
  // Strip any display name: "Name" <a@b> → a@b
  const match = address.match(/<([^>]+)>/)
  const bare = (match ? match[1]! : address).trim().toLowerCase()
  const at = bare.lastIndexOf('@')
  if (at === -1) return null
  return { local: bare.slice(0, at), domain: bare.slice(at + 1) }
}

// Parse an inbound recipient into its routing parts. Returns null if it isn't
// an email address.
export function inboxParseRecipient(address: string): InboxParsedRecipient | null {
  const parts = getLocalAndDomain(address)
  if (!parts) return null
  const { local, domain } = parts
  const plus = local.indexOf('+')
  const base = plus === -1 ? local : local.slice(0, plus)
  const tag = plus === -1 ? '' : local.slice(plus + 1)
  const token = tag ? (tag.split('.')[0] || null) : null
  return { localPart: local, domain, base, token }
}

// Mailgun's VERP return-path local part (`bounce+<verp>@domain`). Reserved —
// never a human mailbox. RFC 3834 responders reply to the Return-Path, so
// out-of-office bots land on this address; the inbound handler drops them.
export const INBOX_BOUNCE_LOCAL_PART = 'bounce'

export function inboxIsBounceRecipient(parsed: InboxParsedRecipient | null): boolean {
  return parsed?.base === INBOX_BOUNCE_LOCAL_PART
}

// The plain reply address a contact uses, e.g. contact+ab12cd@example.com.
export function inboxBuildReplyAddress(token: string, contactAddress: string): string {
  const parts = getLocalAndDomain(contactAddress)
  if (!parts) return contactAddress
  return `${parts.local}+${token}@${parts.domain}`
}

// Outbound From. All mail sends from the shared contact identity; a staff
// display name personalizes replies without per-user aliases.
export function inboxBuildFromAddress(opts: {
  displayName?: string | null
  contactAddress: string
}): string {
  const name = (opts.displayName || '').trim()
  if (!name) return opts.contactAddress
  return `"${name.replace(/"/g, '')}" <${opts.contactAddress}>`
}
