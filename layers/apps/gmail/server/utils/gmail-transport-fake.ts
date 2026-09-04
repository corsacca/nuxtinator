// In-memory Gmail stand-in for the test suite. Models the parts of Gmail's
// IMAP behaviour the layer depends on: one All Mail store plus Trash and
// Spam, labels as the folder/label duality (moving to a label folder adds
// the label; moving to Trash/Spam relocates the message and issues a new
// UID), CONDSTORE-style modseqs, and change events. Sent mail is recorded and
// also filed into All Mail with the \Sent label, as Gmail does.
//
// Seeding and inspection go through the exported gmailFake* helpers, which
// the /api/gmail/_test/* routes expose when the fake transport is active.
import MailComposer from 'nodemailer/lib/mail-composer/index.js'
import {
  GmailAuthError,
  gmailFormatAddress,
  type GmailAddressLike,
  type GmailChangeEvent,
  type GmailCredentials,
  type GmailEnvelope,
  type GmailFetchMetaOptions,
  type GmailFolderInfo,
  type GmailMailboxState,
  type GmailMessageMeta,
  type GmailOutboundMail,
  type GmailSession,
  type GmailTransport
} from './gmail-transport'

export const GMAIL_FAKE_PATHS = {
  inbox: 'INBOX',
  all: '[Gmail]/All Mail',
  trash: '[Gmail]/Trash',
  spam: '[Gmail]/Spam',
  sent: '[Gmail]/Sent Mail',
  drafts: '[Gmail]/Drafts',
  starred: '[Gmail]/Starred',
  important: '[Gmail]/Important'
} as const

interface FakeMessage {
  uid: number
  modseq: number
  gmMsgId: string
  gmThrId: string
  flags: Set<string>
  labels: Set<string>
  internalDate: Date
  size: number
  envelope: GmailEnvelope
  source: Buffer
  text: string
  html: string | null
  hasAttachments: boolean
}

interface FakeFolder {
  path: string
  name: string
  specialUse: string | null
  uidValidity: string
  uidNext: number
  highestModseq: number
  // Only the three mirrored stores hold messages; label folders are views.
  messages: Map<number, FakeMessage> | null
}

interface FakeMailbox {
  email: string
  password: string
  folders: Map<string, FakeFolder>
  hiddenPaths: Set<string>
  seq: number
  sent: GmailOutboundMail[]
  listeners: Set<(event: GmailChangeEvent) => void>
}

const mailboxes = new Map<string, FakeMailbox>()

function folder(path: string, name: string, specialUse: string | null, store: boolean): FakeFolder {
  return { path, name, specialUse, uidValidity: '1', uidNext: 1, highestModseq: 1, messages: store ? new Map() : null }
}

function toAddr(a: GmailAddressLike | string): GmailAddressLike {
  if (typeof a !== 'string') return { name: a.name ?? null, address: a.address.toLowerCase() }
  const m = /^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/.exec(a)
  if (m) return { name: m[1]?.trim() || null, address: m[2]!.trim().toLowerCase() }
  return { name: null, address: a.trim().toLowerCase() }
}

function nextMsgId(box: FakeMailbox): string {
  box.seq += 1
  return String(BigInt('1800000000000000000') + BigInt(box.seq))
}

function emit(box: FakeMailbox, event: GmailChangeEvent) {
  for (const l of box.listeners) l(event)
}

function requireBox(email: string): FakeMailbox {
  const box = mailboxes.get(email.toLowerCase())
  if (!box) throw new Error(`fake mailbox ${email} not seeded`)
  return box
}

function storeOf(box: FakeMailbox, path: string): FakeFolder {
  const f = box.folders.get(path)
  if (!f || !f.messages) throw new Error(`fake folder ${path} is not a message store`)
  return f
}

function locate(box: FakeMailbox, gmMsgId: string): { folder: FakeFolder, msg: FakeMessage } | null {
  for (const f of box.folders.values()) {
    if (!f.messages) continue
    for (const msg of f.messages.values()) {
      if (msg.gmMsgId === gmMsgId) return { folder: f, msg }
    }
  }
  return null
}

function findByMessageId(box: FakeMailbox, messageId: string | null | undefined): FakeMessage | null {
  if (!messageId) return null
  for (const f of box.folders.values()) {
    if (!f.messages) continue
    for (const msg of f.messages.values()) {
      if (msg.envelope.messageId === messageId) return msg
    }
  }
  return null
}

function insert(box: FakeMailbox, f: FakeFolder, msg: FakeMessage): FakeMessage {
  msg.uid = f.uidNext++
  msg.modseq = ++f.highestModseq
  f.messages!.set(msg.uid, msg)
  return msg
}

export interface GmailFakeSeedMessage {
  from: GmailAddressLike | string
  to?: (GmailAddressLike | string)[]
  cc?: (GmailAddressLike | string)[]
  subject?: string
  text?: string
  html?: string | null
  date?: Date | string
  messageId?: string
  inReplyTo?: string | null
  references?: string | null
  labels?: string[]
  flags?: string[]
  folder?: 'all' | 'trash' | 'spam'
  gmThrId?: string
  attachments?: { filename: string, contentType: string, content: string, encoding?: 'utf8' | 'base64' }[]
}

export function gmailFakeReset(): void {
  mailboxes.clear()
}

export function gmailFakeSeedMailbox(opts: { email: string, password: string, labels?: string[], hideAllMail?: boolean }): void {
  const email = opts.email.toLowerCase()
  const folders = new Map<string, FakeFolder>()
  folders.set(GMAIL_FAKE_PATHS.inbox, folder('INBOX', 'INBOX', null, false))
  folders.set(GMAIL_FAKE_PATHS.all, folder(GMAIL_FAKE_PATHS.all, 'All Mail', '\\All', true))
  folders.set(GMAIL_FAKE_PATHS.trash, folder(GMAIL_FAKE_PATHS.trash, 'Trash', '\\Trash', true))
  folders.set(GMAIL_FAKE_PATHS.spam, folder(GMAIL_FAKE_PATHS.spam, 'Spam', '\\Junk', true))
  folders.set(GMAIL_FAKE_PATHS.sent, folder(GMAIL_FAKE_PATHS.sent, 'Sent Mail', '\\Sent', false))
  folders.set(GMAIL_FAKE_PATHS.drafts, folder(GMAIL_FAKE_PATHS.drafts, 'Drafts', '\\Drafts', false))
  folders.set(GMAIL_FAKE_PATHS.starred, folder(GMAIL_FAKE_PATHS.starred, 'Starred', '\\Flagged', false))
  folders.set(GMAIL_FAKE_PATHS.important, folder(GMAIL_FAKE_PATHS.important, 'Important', '\\Important', false))
  for (const label of opts.labels ?? []) folders.set(label, folder(label, label.split('/').pop() || label, null, false))
  const hiddenPaths = new Set<string>()
  if (opts.hideAllMail) hiddenPaths.add(GMAIL_FAKE_PATHS.all)
  mailboxes.set(email, { email, password: opts.password, folders, hiddenPaths, seq: 0, sent: [], listeners: new Set() })
}

export async function gmailFakeDeliver(email: string, seed: GmailFakeSeedMessage): Promise<{ gmMsgId: string, gmThrId: string, uid: number, messageId: string }> {
  const box = requireBox(email)
  const from = toAddr(seed.from)
  const to = (seed.to ?? [email]).map(toAddr)
  const cc = (seed.cc ?? []).map(toAddr)
  const date = seed.date ? new Date(seed.date) : new Date()
  const messageId = seed.messageId ?? `<fake-${box.seq + 1}-${Date.now()}@fake.example>`
  const text = seed.text ?? ''
  const html = seed.html === undefined ? (text ? `<p>${text}</p>` : null) : seed.html
  const attachments = (seed.attachments ?? []).map(a => ({ filename: a.filename, contentType: a.contentType, content: Buffer.from(a.content, a.encoding ?? 'utf8') }))
  const source = await new MailComposer({
    from: gmailFormatAddress(from),
    to: to.map(gmailFormatAddress),
    cc: cc.map(gmailFormatAddress),
    subject: seed.subject ?? '',
    text,
    html: html ?? undefined,
    date,
    messageId,
    inReplyTo: seed.inReplyTo ?? undefined,
    references: seed.references ?? undefined,
    attachments
  }).compile().build()
  const parent = findByMessageId(box, seed.inReplyTo)
  const gmMsgId = nextMsgId(box)
  const gmThrId = seed.gmThrId ?? parent?.gmThrId ?? gmMsgId
  const targetPath = seed.folder === 'trash' ? GMAIL_FAKE_PATHS.trash : seed.folder === 'spam' ? GMAIL_FAKE_PATHS.spam : GMAIL_FAKE_PATHS.all
  const msg: FakeMessage = {
    uid: 0,
    modseq: 0,
    gmMsgId,
    gmThrId,
    flags: new Set(seed.flags ?? []),
    labels: new Set(seed.labels ?? (seed.folder && seed.folder !== 'all' ? [] : ['\\Inbox'])),
    internalDate: date,
    size: source.length,
    envelope: { messageId, inReplyTo: seed.inReplyTo ?? null, subject: seed.subject ?? null, date, from: [from], to, cc, bcc: [], replyTo: [] },
    source,
    text,
    html,
    hasAttachments: attachments.length > 0
  }
  insert(box, storeOf(box, targetPath), msg)
  emit(box, 'exists')
  return { gmMsgId, gmThrId, uid: msg.uid, messageId }
}

export function gmailFakeGetMessage(email: string, gmMsgId: string): { folder: 'all' | 'trash' | 'spam', uid: number, flags: string[], labels: string[] } | null {
  const box = requireBox(email)
  const hit = locate(box, gmMsgId)
  if (!hit) return null
  const folderKey = hit.folder.path === GMAIL_FAKE_PATHS.trash ? 'trash' : hit.folder.path === GMAIL_FAKE_PATHS.spam ? 'spam' : 'all'
  return { folder: folderKey, uid: hit.msg.uid, flags: [...hit.msg.flags], labels: [...hit.msg.labels] }
}

// Simulates another Gmail client changing flags or labels on a message.
export function gmailFakeStore(email: string, gmMsgId: string, change: { addFlags?: string[], removeFlags?: string[], addLabels?: string[], removeLabels?: string[] }): boolean {
  const box = requireBox(email)
  const hit = locate(box, gmMsgId)
  if (!hit) return false
  for (const f of change.addFlags ?? []) hit.msg.flags.add(f)
  for (const f of change.removeFlags ?? []) hit.msg.flags.delete(f)
  for (const l of change.addLabels ?? []) hit.msg.labels.add(l)
  for (const l of change.removeLabels ?? []) hit.msg.labels.delete(l)
  hit.msg.modseq = ++hit.folder.highestModseq
  emit(box, 'flags')
  return true
}

export function gmailFakeListSent(email: string): GmailOutboundMail[] {
  return requireBox(email).sent
}

export function gmailFakeListFolders(email: string): string[] {
  const box = requireBox(email)
  return [...box.folders.keys()].filter(p => !box.hiddenPaths.has(p))
}

function parseRange(range: string, uids: number[]): Set<number> {
  const max = uids.length ? Math.max(...uids) : 0
  const out = new Set<number>()
  for (const piece of range.split(',')) {
    const [a, b] = piece.split(':')
    const lo = a === '*' ? max : Number(a)
    if (b === undefined) {
      out.add(lo)
      continue
    }
    const hiRaw = b === '*' ? max : Number(b)
    // IMAP semantics: "n:*" with n above the highest UID still yields the
    // highest message.
    const from = Math.min(lo, hiRaw)
    const to = Math.max(lo, hiRaw)
    for (const u of uids) if (u >= from && u <= to) out.add(u)
    if (b === '*' && lo > max && max > 0) out.add(max)
  }
  return out
}

function matchesRaw(msg: FakeMessage, query: string): boolean {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  const hay = `${msg.envelope.subject ?? ''} ${msg.text} ${msg.envelope.from.map(a => `${a.name ?? ''} ${a.address}`).join(' ')}`.toLowerCase()
  return tokens.every((tok) => {
    const t = tok.toLowerCase()
    if (t.startsWith('from:')) return msg.envelope.from.some(a => `${a.name ?? ''} ${a.address}`.toLowerCase().includes(t.slice(5)))
    if (t.startsWith('to:')) return msg.envelope.to.some(a => `${a.name ?? ''} ${a.address}`.toLowerCase().includes(t.slice(3)))
    if (t.startsWith('subject:')) return (msg.envelope.subject ?? '').toLowerCase().includes(t.slice(8))
    if (t.startsWith('label:')) return [...msg.labels].some(l => l.toLowerCase() === t.slice(6))
    if (t === 'has:attachment') return msg.hasAttachments
    if (t === 'is:unread') return !msg.flags.has('\\Seen')
    if (t === 'is:starred') return msg.flags.has('\\Flagged')
    return hay.includes(t)
  })
}

class FakeSession implements GmailSession {
  private open: FakeFolder | null = null
  private closed = false
  private readonly mine = new Set<(event: GmailChangeEvent) => void>()

  constructor(private readonly box: FakeMailbox) {}

  get usable(): boolean {
    return !this.closed
  }

  async listFolders(): Promise<GmailFolderInfo[]> {
    return [...this.box.folders.values()]
      .filter(f => !this.box.hiddenPaths.has(f.path))
      .map(f => ({ path: f.path, name: f.name, specialUse: f.specialUse }))
  }

  async openFolder(path: string): Promise<GmailMailboxState> {
    const f = this.box.folders.get(path)
    if (!f || this.box.hiddenPaths.has(path)) throw new Error(`Mailbox doesn't exist: ${path}`)
    this.open = f
    return { path: f.path, uidValidity: f.uidValidity, uidNext: f.uidNext, highestModseq: String(f.highestModseq), exists: f.messages?.size ?? 0 }
  }

  private store(): FakeFolder {
    if (!this.open) throw new Error('no folder open')
    return this.open
  }

  private messages(): FakeMessage[] {
    const f = this.store()
    if (f.messages) return [...f.messages.values()]
    // Label folders are views over All Mail: INBOX shows \Inbox, the rest
    // show messages carrying the folder's label.
    const all = storeOf(this.box, GMAIL_FAKE_PATHS.all)
    const label = f.path === GMAIL_FAKE_PATHS.inbox ? '\\Inbox' : f.specialUse === '\\Sent' ? '\\Sent' : f.specialUse === '\\Flagged' ? null : f.path
    return [...all.messages!.values()].filter(m => label ? m.labels.has(label) : m.flags.has('\\Flagged'))
  }

  async fetchMeta(range: string, opts: GmailFetchMetaOptions = {}): Promise<GmailMessageMeta[]> {
    const msgs = this.messages()
    const wanted = parseRange(range, msgs.map(m => m.uid))
    const since = opts.changedSince ? Number(opts.changedSince) : null
    return msgs
      .filter(m => wanted.has(m.uid) && (since === null || m.modseq > since))
      .sort((a, b) => a.uid - b.uid)
      .map(m => ({
        uid: m.uid,
        modseq: String(m.modseq),
        gmMsgId: m.gmMsgId,
        gmThrId: m.gmThrId,
        flags: [...m.flags],
        labels: [...m.labels],
        internalDate: m.internalDate,
        size: m.size,
        envelope: opts.slim ? null : m.envelope,
        hasAttachments: opts.slim ? false : m.hasAttachments,
        textPart: opts.slim ? null : (m.text ? '1' : null),
        htmlPart: opts.slim ? null : (m.html ? '2' : null)
      }))
  }

  async listUids(): Promise<number[]> {
    return this.messages().map(m => m.uid).sort((a, b) => a - b)
  }

  private byUid(uid: number): FakeMessage | null {
    return this.messages().find(m => m.uid === uid) ?? null
  }

  async fetchSource(uid: number): Promise<Buffer | null> {
    return this.byUid(uid)?.source ?? null
  }

  async fetchPartText(uid: number, part: string, maxBytes: number): Promise<string> {
    const m = this.byUid(uid)
    if (!m) return ''
    const body = part === '2' ? (m.html ?? '') : m.text
    return body.slice(0, maxBytes)
  }

  private touch(msgs: FakeMessage[], event: GmailChangeEvent) {
    const f = this.store()
    const home = f.messages ? f : storeOf(this.box, GMAIL_FAKE_PATHS.all)
    for (const m of msgs) m.modseq = ++home.highestModseq
    emit(this.box, event)
  }

  private select(uids: number[]): FakeMessage[] {
    return this.messages().filter(m => uids.includes(m.uid))
  }

  async addFlags(uids: number[], flags: string[]): Promise<void> {
    const msgs = this.select(uids)
    for (const m of msgs) for (const fl of flags) m.flags.add(fl)
    this.touch(msgs, 'flags')
  }

  async removeFlags(uids: number[], flags: string[]): Promise<void> {
    const msgs = this.select(uids)
    for (const m of msgs) for (const fl of flags) m.flags.delete(fl)
    this.touch(msgs, 'flags')
  }

  async addLabels(uids: number[], labels: string[]): Promise<void> {
    const msgs = this.select(uids)
    for (const m of msgs) for (const l of labels) m.labels.add(l)
    this.touch(msgs, 'flags')
  }

  async removeLabels(uids: number[], labels: string[]): Promise<void> {
    const msgs = this.select(uids)
    for (const m of msgs) for (const l of labels) m.labels.delete(l)
    this.touch(msgs, 'flags')
  }

  async move(uids: number[], destination: string): Promise<Map<number, number>> {
    const source = this.store()
    const msgs = this.select(uids)
    const map = new Map<number, number>()
    if (!msgs.length) return map
    const dest = this.box.folders.get(destination)
    if (!dest) throw new Error(`Mailbox doesn't exist: ${destination}`)
    const all = storeOf(this.box, GMAIL_FAKE_PATHS.all)
    for (const m of msgs) {
      const from = m.uid
      if (dest.messages) {
        if (source.messages) source.messages.delete(m.uid)
        if (dest === source) m.modseq = ++dest.highestModseq
        else insert(this.box, dest, m)
        map.set(from, m.uid)
        continue
      }
      // A label folder: land the message in All Mail (if it isn't there)
      // and add the label. INBOX adds \Inbox.
      if (source.messages && source !== all) {
        source.messages.delete(m.uid)
        insert(this.box, all, m)
      }
      m.labels.add(dest.path === GMAIL_FAKE_PATHS.inbox ? '\\Inbox' : dest.specialUse === '\\Sent' ? '\\Sent' : dest.path)
      m.modseq = ++all.highestModseq
      map.set(from, m.uid)
    }
    emit(this.box, 'expunge')
    emit(this.box, 'exists')
    return map
  }

  async deleteMessages(uids: number[]): Promise<void> {
    const f = this.store()
    if (!f.messages) return
    for (const uid of uids) f.messages.delete(uid)
    emit(this.box, 'expunge')
  }

  async searchRaw(query: string): Promise<number[]> {
    return this.messages().filter(m => matchesRaw(m, query)).map(m => m.uid)
  }

  async createFolder(path: string): Promise<void> {
    if (!this.box.folders.has(path)) this.box.folders.set(path, folder(path, path.split('/').pop() || path, null, false))
  }

  onChange(listener: (event: GmailChangeEvent) => void): () => void {
    this.box.listeners.add(listener)
    this.mine.add(listener)
    return () => {
      this.box.listeners.delete(listener)
      this.mine.delete(listener)
    }
  }

  async close(): Promise<void> {
    this.closed = true
    for (const l of this.mine) this.box.listeners.delete(l)
    this.mine.clear()
  }
}

function authenticate(creds: GmailCredentials): FakeMailbox {
  const box = mailboxes.get(creds.email.toLowerCase())
  if (!box || box.password !== creds.password) throw new GmailAuthError()
  return box
}

export function gmailCreateFakeTransport(): GmailTransport {
  return {
    async connect(creds) {
      return new FakeSession(authenticate(creds))
    },
    async send(creds, mail) {
      const box = authenticate(creds)
      box.sent.push(mail)
      await gmailFakeDeliver(box.email, {
        from: mail.from,
        to: mail.to,
        cc: mail.cc,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        messageId: mail.messageId,
        inReplyTo: mail.inReplyTo,
        references: mail.references,
        labels: ['\\Sent'],
        flags: ['\\Seen'],
        attachments: mail.attachments.map(a => ({ filename: a.filename, contentType: a.contentType, content: a.content.toString('base64'), encoding: 'base64' as const }))
      })
    }
  }
}
