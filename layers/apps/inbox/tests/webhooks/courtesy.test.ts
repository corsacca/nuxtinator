// Courtesy mail (anti-backscatter): the auto-ack goes only to AUTHENTICATED
// senders and carries the RFC 3834 auto-reply headers; an unauthenticated
// (forged-From) submission triggers no mail to the alleged sender; a vacation
// auto-reply landing held closes quietly — no review flag, no staff
// notification, no courtesy loop.
import { describe, it, expect, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  cleanupInboxTestData,
  createInboxOrgWith,
  postInbound,
  waitForMailTo
} from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

function uniqueSender(tag: string) {
  return `test-inbox-${tag}-${randomUUID().slice(0, 8)}@sender.example`
}

const MAILPIT = () => process.env.TEST_MAILHOG_URL || 'http://localhost:8025'

async function mailCountTo(email: string): Promise<number> {
  const res = await fetch(`${MAILPIT()}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
  const body = await res.json() as { messages: Array<{ To: Array<{ Address: string }> }> }
  return (body.messages ?? []).filter(m =>
    m.To.some(t => t.Address.toLowerCase() === email.toLowerCase())
  ).length
}

describe('courtesy mail', () => {
  it('auto-acks an authenticated new conversation with RFC 3834 headers', async () => {
    const { domain } = await createInboxOrgWith(sql)
    const sender = uniqueSender('ack')
    const res = await postInbound({ recipient: `hello@${domain}`, from: `A <${sender}>`, subject: 'Need info' })
    expect(res.body.status).toBe('contact')

    const ack = await waitForMailTo(sender, 15_000)
    expect(ack.subject).toBe('Re: Need info')

    const headersRes = await fetch(`${MAILPIT()}/api/v1/message/${ack.id}/headers`)
    const headers = await headersRes.json() as Record<string, string[]>
    const header = (name: string) => headers[name]?.[0] ?? headers[name.toLowerCase()]?.[0] ?? ''
    expect(header('Auto-Submitted')).toBe('auto-replied')
    expect(header('Precedence')).toBe('bulk')
    // Replies to the ack thread back via the conversation's token address.
    expect(header('Reply-To')).toContain(`@${domain}`)
  })

  it('sends nothing to an unauthenticated (potentially forged) sender', async () => {
    const { domain } = await createInboxOrgWith(sql)
    const sender = uniqueSender('forged')
    const res = await postInbound({
      recipient: `hello@${domain}`,
      from: `F <${sender}>`,
      authenticated: false
    })
    expect(res.body.status).toBe('contact')

    // The courtesy path is fire-and-forget and immediate; give it two
    // seconds of grace before asserting silence.
    await new Promise(r => setTimeout(r, 2_000))
    expect(await mailCountTo(sender)).toBe(0)
  })

  it('closes a held vacation auto-reply quietly — no review flag, no notification, no courtesy', async () => {
    const { domain } = await createInboxOrgWith(sql)
    const jane = uniqueSender('jane')
    const ooo = uniqueSender('ooo')
    const first = await postInbound({ recipient: `hello@${domain}`, from: `Jane <${jane}>` })
    const convId = first.body.conversation_id as string

    const [conv] = await sql`SELECT reply_token FROM inbox_conversations WHERE id = ${convId}`
    const held = await postInbound({
      recipient: `contact+${conv!.reply_token}@${domain}`,
      from: `OOO <${ooo}>`,
      headers: [['Auto-Submitted', 'auto-replied']]
    })
    expect(held.body.status).toBe('held')

    const [row] = await sql`SELECT status, needs_review FROM inbox_conversations WHERE id = ${convId}`
    expect(row!.status).toBe('closed')
    expect(row!.needs_review).toBe(false)

    const notifications = await sql`
      SELECT id FROM notifications WHERE link = ${`/inbox/${convId}`} AND title LIKE 'Held message%'
    `
    expect(notifications.length).toBe(0)

    await new Promise(r => setTimeout(r, 2_000))
    expect(await mailCountTo(ooo)).toBe(0)
  })
})
