// The mirror: threads aggregate their messages, flag changes on Gmail's side
// show up after a pass, new mail arrives through the live session without an
// explicit sync, and the label folders are mirrored.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb, cleanupGmailTestData, createGmailOrgWith, seedMailbox, deliver, connectAccount, syncAccount,
  listThreads, getThread, fakeAddress, sweep, waitFor, findThreadBySubject, fakeStore
} from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => {
  await cleanupGmailTestData(sql)
})

describe('sync', () => {
  it('aggregates threads, participants, unread and starred state', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email, 'app-password-1234', { labels: ['Work', 'Work/Projects'] })
    const first = await deliver(email, { from: 'Jane <jane@sender.example>', subject: 'Plan', text: 'Draft plan attached?', date: '2026-01-10T10:00:00Z' })
    await deliver(email, { from: 'Bob <bob@sender.example>', subject: 'Re: Plan', text: 'Looks good', inReplyTo: first.messageId, date: '2026-01-11T10:00:00Z', flags: ['\\Flagged'] })
    await deliver(email, { from: 'Ann <ann@sender.example>', subject: 'Lunch?', text: 'Tomorrow', flags: ['\\Seen'], labels: ['\\Inbox', 'Work'] })
    const account = await connectAccount(opts, email)
    await syncAccount(opts, account.id)

    const { items, total } = await listThreads(opts)
    expect(total).toBe(2)
    const plan = items.find(t => t.subject === 'Plan')!
    expect(plan.messageCount).toBe(2)
    expect(plan.unreadCount).toBe(2)
    expect(plan.isStarred).toBe(true)
    expect(plan.participants.map(p => p.address).sort()).toEqual(['bob@sender.example', 'jane@sender.example'])
    expect(plan.snippet).toBe('Looks good')
    const lunch = items.find(t => t.subject === 'Lunch?')!
    expect(lunch.unreadCount).toBe(0)
    expect(lunch.labels).toEqual(['Work'])
    // Newest activity first.
    expect(items[0]!.subject).toBe('Lunch?')

    const detail = await getThread(opts, plan.id)
    expect(detail.messages.map(m => m.fromAddr)).toEqual(['jane@sender.example', 'bob@sender.example'])
    expect(detail.messages[1]!.isStarred).toBe(true)
    expect(detail.messages[0]!.bodyFetched).toBe(false)

    const labels = await $fetch<{ labels: { path: string }[] }>('/api/gmail/labels', opts)
    expect(labels.labels.map(l => l.path)).toEqual(['Work', 'Work/Projects'])

    const counts = await $fetch<{ counts: { inboxUnread: number, inboxTotal: number, perAccount: { accountId: string, inboxUnread: number }[] } }>('/api/gmail/threads/counts', opts)
    expect(counts.counts.inboxUnread).toBe(1)
    expect(counts.counts.inboxTotal).toBe(2)
    expect(counts.counts.perAccount).toEqual([{ accountId: account.id, inboxUnread: 1 }])
  })

  it('mirrors mail that arrives after connecting through the live session', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email)
    const account = await connectAccount(opts, email)
    await syncAccount(opts, account.id)
    // Start the session on this process, then let the fake's change event
    // drive the pass — no explicit sync call.
    await sweep()
    await deliver(email, { from: 'late@sender.example', subject: 'Arrived later', text: 'hi' })
    const row = await waitFor(() => findThreadBySubject(opts, 'Arrived later', {}), 10000)
    expect(row.inInbox).toBe(true)
  })

  it('picks up flag and label changes made on Gmail\'s side', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email)
    const m = await deliver(email, { from: 'jane@sender.example', subject: 'Flip me', text: 'x' })
    const account = await connectAccount(opts, email)
    await syncAccount(opts, account.id)
    let row = (await findThreadBySubject(opts, 'Flip me'))!
    expect(row.unreadCount).toBe(1)
    expect(row.inInbox).toBe(true)

    // The phone reads it, stars it, and archives it: only flags and labels
    // change, which the CONDSTORE pass has to notice.
    await fakeStore(email, m.gmMsgId, { addFlags: ['\\Seen', '\\Flagged'], removeLabels: ['\\Inbox'] })
    await syncAccount(opts, account.id)
    row = (await findThreadBySubject(opts, 'Flip me'))!
    expect(row.unreadCount).toBe(0)
    expect(row.isStarred).toBe(true)
    expect(row.inInbox).toBe(false)
    expect((await listThreads(opts, { view: 'inbox' })).items).toHaveLength(0)
  })

  it('reconciliation removes mail deleted on Gmail\'s side', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email)
    const kept = await deliver(email, { from: 'a@sender.example', subject: 'Kept', text: 'x' })
    const doomed = await deliver(email, { from: 'b@sender.example', subject: 'Doomed', text: 'x', folder: 'trash' })
    const account = await connectAccount(opts, email)
    await syncAccount(opts, account.id)
    expect((await listThreads(opts, { view: 'trash' })).items.map(t => t.subject)).toEqual(['Doomed'])

    // Delete forever from the trash view mirrors an expunge; a later sync
    // (with reconciliation) must not resurrect it.
    const doomedRow = (await findThreadBySubject(opts, 'Doomed', { view: 'trash' }))!
    await $fetch(`/api/gmail/threads/${doomedRow.id}/actions`, { method: 'POST', body: { action: 'delete_forever' }, ...opts })
    await syncAccount(opts, account.id)
    expect((await listThreads(opts, { view: 'trash' })).items).toHaveLength(0)
    expect((await listThreads(opts, { view: 'all' })).items.map(t => t.subject)).toEqual(['Kept'])
    expect(await $fetch<{ message: unknown }>('/api/gmail/_test/message', { params: { email, gmMsgId: doomed.gmMsgId } })).toEqual({ message: null })
    expect((await $fetch<{ message: { folder: string } }>('/api/gmail/_test/message', { params: { email, gmMsgId: kept.gmMsgId } })).message.folder).toBe('all')
  })
})
