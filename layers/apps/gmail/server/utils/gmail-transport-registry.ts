// Picks the transport implementation once per process from runtimeConfig:
// the live IMAP/SMTP client, or the in-memory fake the test suite drives.
import type { GmailTransport } from './gmail-transport'
import { gmailCreateImapTransport } from './gmail-transport-imap'
import { gmailCreateFakeTransport } from './gmail-transport-fake'

let _transport: GmailTransport | null = null

export function gmailIsFakeTransport(): boolean {
  return String(useRuntimeConfig().gmailTransport || 'imap') === 'fake'
}

export function gmailGetTransport(): GmailTransport {
  if (_transport) return _transport
  _transport = gmailIsFakeTransport() ? gmailCreateFakeTransport() : gmailCreateImapTransport()
  return _transport
}
