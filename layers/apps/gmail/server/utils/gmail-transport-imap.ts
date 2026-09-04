// imapflow-backed transport against imap.gmail.com / smtp.gmail.com with an
// app password. Gmail's X-GM-EXT-1 extension supplies stable message and
// thread ids, labels, and raw search; imapflow surfaces them as `emailId`,
// `threadId`, `labels` and the `gmraw` search key.
import { ImapFlow, type FetchMessageObject, type MessageAddressObject, type MessageStructureObject } from 'imapflow'
import nodemailer from 'nodemailer'
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

const IMAP_HOST = 'imap.gmail.com'
const IMAP_PORT = 993
const SMTP_HOST = 'smtp.gmail.com'
const SMTP_PORT = 465

function addresses(list: MessageAddressObject[] | undefined): GmailAddressLike[] {
  return (list ?? [])
    .filter(a => !!a.address)
    .map(a => ({ name: a.name?.trim() || null, address: String(a.address).trim().toLowerCase() }))
}

// Locates the first text/plain and text/html leaves and whether any leaf is
// a real attachment. Single-part messages have no part number in the
// structure; IMAP addresses their body as part "1".
export function gmailInspectStructure(root: MessageStructureObject | undefined): { textPart: string | null, htmlPart: string | null, hasAttachments: boolean } {
  let textPart: string | null = null
  let htmlPart: string | null = null
  let hasAttachments = false
  const walk = (node: MessageStructureObject) => {
    if (node.childNodes?.length) {
      for (const child of node.childNodes) walk(child)
      return
    }
    const type = (node.type || '').toLowerCase()
    const disposition = (node.disposition || '').toLowerCase()
    const filename = node.dispositionParameters?.filename || node.parameters?.name
    const isAttachment = disposition === 'attachment' || (!!filename && !type.startsWith('text/'))
    if (isAttachment) {
      hasAttachments = true
      return
    }
    if (type === 'text/plain' && !textPart) textPart = node.part || '1'
    if (type === 'text/html' && !htmlPart) htmlPart = node.part || '1'
  }
  if (root) walk(root)
  return { textPart, htmlPart, hasAttachments }
}

function toMeta(m: FetchMessageObject, slim: boolean): GmailMessageMeta | null {
  if (!m.emailId || !m.threadId) return null
  const env = m.envelope
  const envelope: GmailEnvelope | null = slim || !env
    ? null
    : {
        messageId: env.messageId || null,
        inReplyTo: env.inReplyTo || null,
        subject: env.subject ?? null,
        date: env.date ? new Date(env.date) : null,
        from: addresses(env.from),
        to: addresses(env.to),
        cc: addresses(env.cc),
        bcc: addresses(env.bcc),
        replyTo: addresses(env.replyTo)
      }
  const structure = slim ? { textPart: null, htmlPart: null, hasAttachments: false } : gmailInspectStructure(m.bodyStructure)
  return {
    uid: m.uid,
    modseq: m.modseq !== undefined ? String(m.modseq) : null,
    gmMsgId: m.emailId,
    gmThrId: m.threadId,
    flags: [...(m.flags ?? [])],
    labels: [...(m.labels ?? [])],
    internalDate: m.internalDate ? new Date(m.internalDate) : new Date(),
    size: m.size ?? null,
    envelope,
    ...structure
  }
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

function decodeText(buf: Buffer, charset: string | undefined): string {
  try {
    return new TextDecoder(charset || 'utf-8').decode(buf)
  } catch {
    return buf.toString('utf8')
  }
}

class ImapSession implements GmailSession {
  constructor(private readonly client: ImapFlow) {}

  get usable(): boolean {
    return this.client.usable
  }

  async listFolders(): Promise<GmailFolderInfo[]> {
    const list = await this.client.list()
    return list.map(f => ({ path: f.path, name: f.name, specialUse: f.specialUse ?? null }))
  }

  async openFolder(path: string): Promise<GmailMailboxState> {
    const mb = await this.client.mailboxOpen(path)
    return {
      path: mb.path,
      uidValidity: String(mb.uidValidity),
      uidNext: mb.uidNext,
      highestModseq: mb.highestModseq !== undefined ? String(mb.highestModseq) : null,
      exists: mb.exists
    }
  }

  async fetchMeta(range: string, opts: GmailFetchMetaOptions = {}): Promise<GmailMessageMeta[]> {
    const slim = !!opts.slim
    const query = slim
      ? { uid: true, flags: true, labels: true, threadId: true }
      : { uid: true, flags: true, labels: true, threadId: true, envelope: true, internalDate: true, size: true, bodyStructure: true }
    const out: GmailMessageMeta[] = []
    for await (const m of this.client.fetch(range, query, {
      uid: true,
      changedSince: opts.changedSince ? BigInt(opts.changedSince) : undefined
    })) {
      const meta = toMeta(m, slim)
      if (meta) out.push(meta)
    }
    return out
  }

  async listUids(): Promise<number[]> {
    const res = await this.client.search({ all: true }, { uid: true })
    return res || []
  }

  async fetchSource(uid: number): Promise<Buffer | null> {
    const m = await this.client.fetchOne(String(uid), { source: true }, { uid: true })
    return m && m.source ? m.source : null
  }

  async fetchPartText(uid: number, part: string, maxBytes: number): Promise<string> {
    const dl = await this.client.download(String(uid), part, { uid: true, maxBytes })
    const buf = await readAll(dl.content)
    return decodeText(buf, dl.meta?.charset)
  }

  async addFlags(uids: number[], flags: string[]): Promise<void> {
    if (!uids.length) return
    await this.client.messageFlagsAdd(uids, flags, { uid: true })
  }

  async removeFlags(uids: number[], flags: string[]): Promise<void> {
    if (!uids.length) return
    await this.client.messageFlagsRemove(uids, flags, { uid: true })
  }

  async addLabels(uids: number[], labels: string[]): Promise<void> {
    if (!uids.length || !labels.length) return
    await this.client.messageFlagsAdd(uids, labels, { uid: true, useLabels: true })
  }

  async removeLabels(uids: number[], labels: string[]): Promise<void> {
    if (!uids.length || !labels.length) return
    await this.client.messageFlagsRemove(uids, labels, { uid: true, useLabels: true })
  }

  async move(uids: number[], destination: string): Promise<Map<number, number>> {
    if (!uids.length) return new Map()
    const res = await this.client.messageMove(uids, destination, { uid: true })
    return res && res.uidMap ? res.uidMap : new Map()
  }

  async deleteMessages(uids: number[]): Promise<void> {
    if (!uids.length) return
    await this.client.messageDelete(uids, { uid: true })
  }

  async searchRaw(query: string): Promise<number[]> {
    const res = await this.client.search({ gmraw: query }, { uid: true })
    return res || []
  }

  async createFolder(path: string): Promise<void> {
    await this.client.mailboxCreate(path)
  }

  onChange(listener: (event: GmailChangeEvent) => void): () => void {
    const onExists = () => listener('exists')
    const onExpunge = () => listener('expunge')
    const onFlags = () => listener('flags')
    this.client.on('exists', onExists)
    this.client.on('expunge', onExpunge)
    this.client.on('flags', onFlags)
    return () => {
      this.client.off('exists', onExists)
      this.client.off('expunge', onExpunge)
      this.client.off('flags', onFlags)
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.logout()
    } catch {
      this.client.close()
    }
  }
}

function isAuthFailure(err: unknown): boolean {
  const e = err as { authenticationFailed?: boolean, responseText?: string, message?: string }
  return !!e?.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|Username and Password not accepted/i.test(`${e?.responseText ?? ''} ${e?.message ?? ''}`)
}

export function gmailCreateImapTransport(): GmailTransport {
  return {
    async connect(creds: GmailCredentials): Promise<GmailSession> {
      const client = new ImapFlow({
        host: IMAP_HOST,
        port: IMAP_PORT,
        secure: true,
        auth: { user: creds.email, pass: creds.password },
        logger: false,
        // Start IDLE quickly after each command burst so change events keep
        // flowing between sync passes.
        autoIdleDelay: 3000,
        clientInfo: { name: 'nuxtinator-gmail' }
      })
      // A dropped socket raises 'error' asynchronously; the session's
      // `usable` flag is what the sync manager acts on.
      client.on('error', () => {})
      try {
        await client.connect()
      } catch (err) {
        if (isAuthFailure(err)) throw new GmailAuthError()
        throw err
      }
      return new ImapSession(client)
    },

    async send(creds: GmailCredentials, mail: GmailOutboundMail): Promise<void> {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: true,
        auth: { user: creds.email, pass: creds.password }
      })
      try {
        await transporter.sendMail({
          from: gmailFormatAddress(mail.from),
          to: mail.to.map(gmailFormatAddress),
          cc: mail.cc.map(gmailFormatAddress),
          bcc: mail.bcc.map(gmailFormatAddress),
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          messageId: mail.messageId,
          inReplyTo: mail.inReplyTo ?? undefined,
          references: mail.references ?? undefined,
          attachments: mail.attachments.map(a => ({
            filename: a.filename,
            contentType: a.contentType,
            content: a.content,
            cid: a.cid
          }))
        })
      } catch (err) {
        if (isAuthFailure(err)) throw new GmailAuthError()
        throw err
      } finally {
        transporter.close()
      }
    }
  }
}
