// Drafts and the outbound queue: autosave, the undo window, the send sweep
// (via the fake SMTP), threading headers and quoted history on replies,
// forwarded attachments, and the Sent copy showing up after sync.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb, cleanupGmailTestData, createGmailOrgWith, seedMailbox, deliver, connectAccount, syncAccount,
  listThreads, getThread, fakeAddress, findThreadBySubject, sweep, listSent, waitFor, type OrgOpts
} from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => {
  await cleanupGmailTestData(sql)
})

interface Draft {
  id: string
  accountId: string
  mode: string
  threadId: string | null
  to: { name: string | null, address: string }[]
  cc: { name: string | null, address: string }[]
  subject: string | null
  bodyHtml: string | null
  status: string
  sendAfter: string | null
  attachments: { id: string, filename: string, size: number }[]
}

async function createDraft(opts: OrgOpts, body: Record<string, unknown>): Promise<Draft> {
  return (await $fetch<{ draft: Draft }>('/api/gmail/drafts', { method: 'POST', body, ...opts })).draft
}

async function setUndo(opts: OrgOpts, seconds: number) {
  await $fetch('/api/gmail/prefs', { method: 'PUT', body: { undoSendSeconds: seconds }, ...opts })
}

describe('drafts and sending', () => {
  it('autosaves a new draft, queues it behind the undo window, and can undo', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email)
    const account = await connectAccount(opts, email, 'app-password-1234', 'Sender Name')
    await syncAccount(opts, account.id)

    const draft = await createDraft(opts, { accountId: account.id, mode: 'new', subject: 'Hi', bodyHtml: '<p>hello</p>' })
    expect(draft.status).toBe('draft')
    const drafts = await $fetch<{ drafts: Draft[] }>('/api/gmail/drafts', opts)
    expect(drafts.drafts.map(d => d.id)).toEqual([draft.id])

    // No recipients → refused.
    await expect($fetch(`/api/gmail/drafts/${draft.id}/send`, { method: 'POST', ...opts })).rejects.toMatchObject({ statusCode: 400 })

    const patched = await $fetch<{ draft: Draft }>(`/api/gmail/drafts/${draft.id}`, {
      method: 'PATCH', body: { to: [{ name: 'Pat', address: 'PAT@example.com' }, { address: 'not-an-email' }], subject: 'Hi there' }, ...opts
    })
    expect(patched.draft.to).toEqual([{ name: 'Pat', address: 'pat@example.com' }])

    await setUndo(opts, 30)
    const queued = await $fetch<{ queued: boolean, sendAfter: string }>(`/api/gmail/drafts/${draft.id}/send`, { method: 'POST', ...opts })
    expect(new Date(queued.sendAfter).getTime()).toBeGreaterThan(Date.now() + 20_000)
    const counts = await $fetch<{ counts: { drafts: number } }>('/api/gmail/threads/counts', opts)
    expect(counts.counts.drafts).toBe(1)
    await sweep()
    expect(await listSent(email)).toHaveLength(0)

    await $fetch(`/api/gmail/drafts/${draft.id}/unsend`, { method: 'POST', ...opts })
    const back = await $fetch<{ draft: Draft }>(`/api/gmail/drafts/${draft.id}`, opts)
    expect(back.draft.status).toBe('draft')

    await setUndo(opts, 0)
    await $fetch(`/api/gmail/drafts/${draft.id}/send`, { method: 'POST', ...opts })
    await sweep()
    const sent = await listSent(email)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.from).toEqual({ name: 'Sender Name', address: email })
    expect(sent[0]!.to).toEqual([{ name: 'Pat', address: 'pat@example.com' }])
    expect(sent[0]!.subject).toBe('Hi there')
    expect(sent[0]!.html).toContain('<p>hello</p>')
    expect(sent[0]!.text).toContain('hello')
    expect(sent[0]!.inReplyTo).toBeNull()
    await expect($fetch(`/api/gmail/drafts/${draft.id}/unsend`, { method: 'POST', ...opts })).rejects.toMatchObject({ statusCode: 409 })

    // Gmail files the copy under \Sent; the mirror shows it in the Sent view.
    await syncAccount(opts, account.id)
    const sentView = await listThreads(opts, { view: 'sent' })
    expect(sentView.items.map(t => t.subject)).toEqual(['Hi there'])
    const addresses = await $fetch<{ addresses: { email: string, name: string | null }[] }>('/api/gmail/addresses', { params: { q: 'pat' }, ...opts })
    expect(addresses.addresses.map(a => a.email)).toContain('pat@example.com')
  })

  it('replies thread correctly and quote the original', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email)
    const original = await deliver(email, { from: 'Jane <jane@sender.example>', to: [email], cc: ['carl@sender.example'], subject: 'Question', text: 'What time?', html: '<p>What <b>time</b>?</p>' })
    const account = await connectAccount(opts, email)
    await syncAccount(opts, account.id)
    const row = (await findThreadBySubject(opts, 'Question'))!
    const detail = await getThread(opts, row.id)
    const msg = detail.messages[0]!

    const draft = await createDraft(opts, {
      accountId: account.id, mode: 'reply_all', threadId: row.id, replyToMessageId: msg.id,
      to: [{ address: 'jane@sender.example' }], cc: [{ address: 'carl@sender.example' }], subject: 'Re: Question', bodyHtml: '<p>Noon.</p>'
    })
    await setUndo(opts, 0)
    await $fetch(`/api/gmail/drafts/${draft.id}/send`, { method: 'POST', ...opts })
    await sweep()
    const sent = await listSent(email)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.inReplyTo).toBe(original.messageId)
    expect(sent[0]!.references).toContain(original.messageId)
    expect(sent[0]!.html).toContain('<p>Noon.</p>')
    expect(sent[0]!.html).toContain('wrote:')
    expect(sent[0]!.html).toContain('What <b>time</b>?')
    expect(sent[0]!.cc.map(a => a.address)).toEqual(['carl@sender.example'])

    // The reply lands in the same Gmail thread and the mirror shows both.
    await syncAccount(opts, account.id)
    const after = await getThread(opts, row.id)
    expect(after.thread.messageCount).toBe(2)
    expect(after.thread.hasSent).toBe(true)
  })

  it('forwards with the original attachments', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email)
    await deliver(email, {
      from: 'jane@sender.example', subject: 'Report', text: 'See attached',
      attachments: [{ filename: 'report.txt', contentType: 'text/plain', content: 'quarterly numbers' }]
    })
    const account = await connectAccount(opts, email)
    await syncAccount(opts, account.id)
    const row = (await findThreadBySubject(opts, 'Report'))!
    const msg = (await getThread(opts, row.id)).messages[0]!
    const draft = await createDraft(opts, { accountId: account.id, mode: 'forward', threadId: row.id, replyToMessageId: msg.id, to: [{ address: 'boss@example.com' }], subject: 'Fwd: Report', bodyHtml: '<p>FYI</p>' })
    await setUndo(opts, 0)
    await $fetch(`/api/gmail/drafts/${draft.id}/send`, { method: 'POST', ...opts })
    await sweep()
    const sent = await listSent(email)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.html).toContain('Forwarded message')
    expect(sent[0]!.attachments.map(a => a.filename)).toEqual(['report.txt'])
    expect(sent[0]!.inReplyTo).toBeNull()
  })

  it('stages uploaded attachments and sends them', async () => {
    if (!process.env.S3_BUCKET_NAME) return
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email)
    const account = await connectAccount(opts, email)
    const draft = await createDraft(opts, { accountId: account.id, mode: 'new', to: [{ address: 'x@example.com' }], subject: 'With file', bodyHtml: '<p>file</p>' })
    const form = new FormData()
    form.append('file', new Blob(['hello file'], { type: 'text/plain' }), 'notes.txt')
    const up = await $fetch<{ attachment: { id: string, filename: string, size: number } }>(`/api/gmail/drafts/${draft.id}/attachments`, { method: 'POST', body: form, ...opts })
    expect(up.attachment.filename).toBe('notes.txt')
    expect(up.attachment.size).toBe(10)
    const withAtt = await $fetch<{ draft: Draft }>(`/api/gmail/drafts/${draft.id}`, opts)
    expect(withAtt.draft.attachments).toHaveLength(1)
    await setUndo(opts, 0)
    await $fetch(`/api/gmail/drafts/${draft.id}/send`, { method: 'POST', ...opts })
    await sweep()
    const sent = await waitFor(async () => {
      const s = await listSent(email)
      return s.length ? s : null
    })
    expect(sent[0]!.attachments).toEqual([{ filename: 'notes.txt', contentType: 'text/plain', size: 10 }])
  })

  it('discarding a draft removes it; other users cannot see it', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email)
    const account = await connectAccount(opts, email)
    const draft = await createDraft(opts, { accountId: account.id, mode: 'new', subject: 'Bin me' })
    const other = await createGmailOrgWith(sql)
    await expect($fetch(`/api/gmail/drafts/${draft.id}`, other.opts)).rejects.toMatchObject({ statusCode: 404 })
    await $fetch(`/api/gmail/drafts/${draft.id}`, { method: 'DELETE', ...opts })
    await expect($fetch(`/api/gmail/drafts/${draft.id}`, opts)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('prefs store only overrides and merge with code defaults', async () => {
    const { opts, user } = await createGmailOrgWith(sql)
    const initial = await $fetch<{ prefs: { undoSendSeconds: number } }>('/api/gmail/prefs', opts)
    expect(initial.prefs.undoSendSeconds).toBe(10)
    await setUndo(opts, 20)
    let rows = await sql`SELECT prefs FROM gmail_user_prefs WHERE user_id = ${user.id}`
    expect(rows[0]!.prefs).toEqual({ undoSendSeconds: 20 })
    await setUndo(opts, 10)
    rows = await sql`SELECT prefs FROM gmail_user_prefs WHERE user_id = ${user.id}`
    expect(rows[0]!.prefs).toEqual({})
  })
})
