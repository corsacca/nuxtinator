// The mail transport contract. Everything that talks to Google goes through
// this interface so the sync engine, the triage actions, and the send sweep
// never depend on IMAP details, and so tests can run against the in-memory
// fake (gmail-transport-fake.ts) instead of a live mailbox.
//
// Sessions are folder-stateful like IMAP itself: `openFolder` selects a
// mailbox and the fetch/flag/move calls operate on it by UID.

export interface GmailAddressLike {
  name: string | null
  address: string
}

export interface GmailEnvelope {
  messageId: string | null
  inReplyTo: string | null
  subject: string | null
  date: Date | null
  from: GmailAddressLike[]
  to: GmailAddressLike[]
  cc: GmailAddressLike[]
  bcc: GmailAddressLike[]
  replyTo: GmailAddressLike[]
}

export interface GmailMessageMeta {
  uid: number
  modseq: string | null
  gmMsgId: string
  gmThrId: string
  flags: string[]
  labels: string[]
  internalDate: Date
  size: number | null
  // Absent on a slim (flags/labels only) fetch.
  envelope: GmailEnvelope | null
  hasAttachments: boolean
  textPart: string | null
  htmlPart: string | null
}

export interface GmailFolderInfo {
  path: string
  name: string
  // IMAP SPECIAL-USE attribute (\All, \Trash, \Junk, \Sent, \Drafts,
  // \Flagged, \Important) or null for INBOX and user labels.
  specialUse: string | null
}

export interface GmailMailboxState {
  path: string
  uidValidity: string
  uidNext: number
  highestModseq: string | null
  exists: number
}

export type GmailChangeEvent = 'exists' | 'expunge' | 'flags'

export interface GmailFetchMetaOptions {
  // CONDSTORE cursor: only messages changed since this modseq come back.
  changedSince?: string | null
  // Flags, labels and ids only — no envelope or structure.
  slim?: boolean
}

export interface GmailSession {
  readonly usable: boolean
  listFolders(): Promise<GmailFolderInfo[]>
  openFolder(path: string): Promise<GmailMailboxState>
  // UID range (e.g. "1:*", "120:140") within the open folder.
  fetchMeta(range: string, opts?: GmailFetchMetaOptions): Promise<GmailMessageMeta[]>
  listUids(): Promise<number[]>
  fetchSource(uid: number): Promise<Buffer | null>
  // A bounded, transfer-decoded prefix of one MIME part, as text.
  fetchPartText(uid: number, part: string, maxBytes: number): Promise<string>
  addFlags(uids: number[], flags: string[]): Promise<void>
  removeFlags(uids: number[], flags: string[]): Promise<void>
  addLabels(uids: number[], labels: string[]): Promise<void>
  removeLabels(uids: number[], labels: string[]): Promise<void>
  // Returns the source→destination UID map (UIDPLUS COPYUID); empty when
  // the server did not report one.
  move(uids: number[], destination: string): Promise<Map<number, number>>
  // Permanent removal from the open folder (Trash/Spam only in practice).
  deleteMessages(uids: number[]): Promise<void>
  // Gmail's native search syntax (X-GM-RAW) over the open folder.
  searchRaw(query: string): Promise<number[]>
  createFolder(path: string): Promise<void>
  onChange(listener: (event: GmailChangeEvent) => void): () => void
  close(): Promise<void>
}

export interface GmailCredentials {
  email: string
  password: string
}

export interface GmailOutboundAttachment {
  filename: string
  contentType: string
  content: Buffer
  cid?: string
}

export interface GmailOutboundMail {
  from: GmailAddressLike
  to: GmailAddressLike[]
  cc: GmailAddressLike[]
  bcc: GmailAddressLike[]
  subject: string
  html: string
  text: string
  messageId: string
  inReplyTo: string | null
  references: string | null
  attachments: GmailOutboundAttachment[]
}

export interface GmailTransport {
  // Throws GmailAuthError when Google rejects the credentials.
  connect(creds: GmailCredentials): Promise<GmailSession>
  send(creds: GmailCredentials, mail: GmailOutboundMail): Promise<void>
}

export class GmailAuthError extends Error {
  constructor(message = 'Gmail rejected the email address or app password') {
    super(message)
    this.name = 'GmailAuthError'
  }
}

export function gmailFormatAddress(a: GmailAddressLike): string {
  if (!a.name) return a.address
  const safe = a.name.replace(/["\r\n]/g, '')
  return `"${safe}" <${a.address}>`
}
