// Triage actions write through to Gmail (the fake mailbox) and mirror
// locally in the same request: archive/inbox, read state, stars, trash,
// spam, labels, and delete-forever.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb, cleanupGmailTestData, createGmailOrgWith, seedMailbox, deliver, connectAccount, syncAccount,
  listThreads, getThread, threadAction, fakeMessage, fakeAddress, findThreadBySubject
} from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => {
  await cleanupGmailTestData(sql)
})

async function setup(subject = 'Triage me') {
  const { opts } = await createGmailOrgWith(sql)
  const email = fakeAddress()
  await seedMailbox(email, 'app-password-1234', { labels: ['Work'] })
  const m = await deliver(email, { from: 'jane@sender.example', subject, text: 'body' })
  const account = await connectAccount(opts, email)
  await syncAccount(opts, account.id)
  const row = (await findThreadBySubject(opts, subject))!
  return { opts, email, m, account, row }
}

describe('thread actions', () => {
  it('archives and restores to inbox', async () => {
    const { opts, email, m, row } = await setup()
    await threadAction(opts, row.id, 'archive')
    expect((await fakeMessage(email, m.gmMsgId))!.labels).not.toContain('\\Inbox')
    expect((await listThreads(opts, { view: 'inbox' })).items).toHaveLength(0)
    expect((await listThreads(opts, { view: 'all' })).items.map(t => t.id)).toEqual([row.id])

    await threadAction(opts, row.id, 'move_to_inbox')
    expect((await fakeMessage(email, m.gmMsgId))!.labels).toContain('\\Inbox')
    expect((await listThreads(opts, { view: 'inbox' })).items.map(t => t.id)).toEqual([row.id])
  })

  it('marks read and unread, stars and unstars', async () => {
    const { opts, email, m, row } = await setup()
    await threadAction(opts, row.id, 'mark_read')
    expect((await fakeMessage(email, m.gmMsgId))!.flags).toContain('\\Seen')
    expect((await getThread(opts, row.id)).thread.unreadCount).toBe(0)
    await threadAction(opts, row.id, 'mark_unread')
    expect((await fakeMessage(email, m.gmMsgId))!.flags).not.toContain('\\Seen')
    expect((await getThread(opts, row.id)).thread.unreadCount).toBe(1)

    await threadAction(opts, row.id, 'star')
    expect((await fakeMessage(email, m.gmMsgId))!.flags).toContain('\\Flagged')
    expect((await listThreads(opts, { view: 'starred' })).items.map(t => t.id)).toEqual([row.id])
    await threadAction(opts, row.id, 'unstar')
    expect((await listThreads(opts, { view: 'starred' })).items).toHaveLength(0)
  })

  it('trashes, restores, and deletes forever', async () => {
    const { opts, email, m, row } = await setup()
    await threadAction(opts, row.id, 'trash')
    expect((await fakeMessage(email, m.gmMsgId))!.folder).toBe('trash')
    expect((await listThreads(opts, { view: 'inbox' })).items).toHaveLength(0)
    expect((await listThreads(opts, { view: 'trash' })).items.map(t => t.id)).toEqual([row.id])

    await threadAction(opts, row.id, 'untrash')
    const state = (await fakeMessage(email, m.gmMsgId))!
    expect(state.folder).toBe('all')
    expect(state.labels).toContain('\\Inbox')
    expect((await listThreads(opts, { view: 'inbox' })).items.map(t => t.id)).toEqual([row.id])

    await expect(threadAction(opts, row.id, 'delete_forever')).rejects.toMatchObject({ statusCode: 400 })
    await threadAction(opts, row.id, 'trash')
    await threadAction(opts, row.id, 'delete_forever')
    expect(await fakeMessage(email, m.gmMsgId)).toBeNull()
    await expect(getThread(opts, row.id)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('reports spam and takes it back', async () => {
    const { opts, email, m, row } = await setup()
    await threadAction(opts, row.id, 'spam')
    expect((await fakeMessage(email, m.gmMsgId))!.folder).toBe('spam')
    expect((await listThreads(opts, { view: 'spam' })).items.map(t => t.id)).toEqual([row.id])
    expect((await listThreads(opts, { view: 'all' })).items).toHaveLength(0)
    await threadAction(opts, row.id, 'not_spam')
    expect((await fakeMessage(email, m.gmMsgId))!.folder).toBe('all')
    expect((await listThreads(opts, { view: 'inbox' })).items.map(t => t.id)).toEqual([row.id])
  })

  it('applies, filters by, creates, and removes labels', async () => {
    const { opts, email, m, row, account } = await setup()
    await threadAction(opts, row.id, 'add_label', { label: 'Work' })
    expect((await fakeMessage(email, m.gmMsgId))!.labels).toContain('Work')
    expect((await listThreads(opts, { label: 'Work', view: 'all' })).items.map(t => t.id)).toEqual([row.id])

    // A label Gmail doesn't have yet is created on the way.
    await threadAction(opts, row.id, 'add_label', { label: 'Receipts/2026' })
    expect((await fakeMessage(email, m.gmMsgId))!.labels).toContain('Receipts/2026')
    const labels = await $fetch<{ labels: { path: string, accountId: string }[] }>('/api/gmail/labels', opts)
    expect(labels.labels.map(l => l.path)).toEqual(['Receipts/2026', 'Work'])
    expect(labels.labels.every(l => l.accountId === account.id)).toBe(true)

    await threadAction(opts, row.id, 'remove_label', { label: 'Work' })
    expect((await fakeMessage(email, m.gmMsgId))!.labels).not.toContain('Work')
    expect((await getThread(opts, row.id)).thread.labels).toEqual(['Receipts/2026'])

    await expect(threadAction(opts, row.id, 'add_label', { label: '\\Inbox' })).rejects.toMatchObject({ statusCode: 400 })
    const created = await $fetch<{ label: { path: string } | null }>('/api/gmail/labels', { method: 'POST', body: { accountId: account.id, name: 'Travel' }, ...opts })
    expect(created.label?.path).toBe('Travel')
  })

  it('refuses actions on another user\'s thread', async () => {
    const { row } = await setup()
    const other = await createGmailOrgWith(sql)
    await expect(threadAction(other.opts, row.id, 'archive')).rejects.toMatchObject({ statusCode: 404 })
  })
})
