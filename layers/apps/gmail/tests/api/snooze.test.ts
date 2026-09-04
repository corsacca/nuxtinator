// Snooze is local: the thread leaves the inbox and Gmail is untouched. It
// wakes on its timer, on a reply, or by hand, and comes back at the top.
import { describe, it, expect, afterEach } from 'vitest'
import {
  getHostAdminDb, cleanupGmailTestData, createGmailOrgWith, seedMailbox, deliver, connectAccount, syncAccount,
  listThreads, getThread, threadAction, fakeMessage, fakeAddress, findThreadBySubject, sweep, waitFor
} from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => {
  await cleanupGmailTestData(sql)
})

describe('snooze', () => {
  it('hides the thread until the timer, without touching Gmail', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email)
    const older = await deliver(email, { from: 'a@sender.example', subject: 'Older', text: 'x', date: '2026-01-01T00:00:00Z' })
    await deliver(email, { from: 'b@sender.example', subject: 'Newer', text: 'x', date: '2026-02-01T00:00:00Z' })
    const account = await connectAccount(opts, email)
    await syncAccount(opts, account.id)
    const row = (await findThreadBySubject(opts, 'Older'))!

    await expect(threadAction(opts, row.id, 'snooze', { wakeAt: new Date(Date.now() - 1000).toISOString() })).rejects.toMatchObject({ statusCode: 400 })

    const wakeAt = new Date(Date.now() + 1500)
    await threadAction(opts, row.id, 'snooze', { wakeAt: wakeAt.toISOString() })
    expect((await listThreads(opts, { view: 'inbox' })).items.map(t => t.subject)).toEqual(['Newer'])
    const snoozed = await listThreads(opts, { view: 'snoozed' })
    expect(snoozed.items.map(t => t.subject)).toEqual(['Older'])
    expect(Math.abs(new Date(snoozed.items[0]!.snoozedUntil!).getTime() - wakeAt.getTime())).toBeLessThan(1000)
    expect((await fakeMessage(email, older.gmMsgId))!.labels).toContain('\\Inbox')

    await new Promise(r => setTimeout(r, 1600))
    const res = await sweep()
    expect(res.woke).toBe(1)
    const inbox = await listThreads(opts, { view: 'inbox' })
    // Woken threads surface at the top, above newer mail.
    expect(inbox.items.map(t => t.subject)).toEqual(['Older', 'Newer'])
    expect(inbox.items[0]!.wokenAt).not.toBeNull()
    expect(inbox.items[0]!.snoozedUntil).toBeNull()
    expect((await listThreads(opts, { view: 'snoozed' })).items).toHaveLength(0)
  })

  it('wakes early when a reply arrives', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email)
    const first = await deliver(email, { from: 'jane@sender.example', subject: 'Waiting', text: 'x' })
    const account = await connectAccount(opts, email)
    await syncAccount(opts, account.id)
    const row = (await findThreadBySubject(opts, 'Waiting'))!
    await threadAction(opts, row.id, 'snooze', { wakeAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
    expect((await listThreads(opts, { view: 'inbox' })).items).toHaveLength(0)

    await deliver(email, { from: 'jane@sender.example', subject: 'Re: Waiting', text: 'ping', inReplyTo: first.messageId })
    await syncAccount(opts, account.id)
    const detail = await getThread(opts, row.id)
    expect(detail.thread.snoozedUntil).toBeNull()
    expect(detail.thread.messageCount).toBe(2)
    expect((await listThreads(opts, { view: 'inbox' })).items.map(t => t.id)).toEqual([row.id])
    const reasons = await sql`SELECT wake_reason FROM gmail_snoozes WHERE thread_id = ${row.id}`
    expect(reasons.map(r => r.wake_reason)).toEqual(['reply'])
  })

  it('unsnoozes by hand and re-snoozing replaces the timer', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email)
    await deliver(email, { from: 'jane@sender.example', subject: 'Manual', text: 'x' })
    const account = await connectAccount(opts, email)
    await syncAccount(opts, account.id)
    const row = (await findThreadBySubject(opts, 'Manual'))!
    await threadAction(opts, row.id, 'snooze', { wakeAt: new Date(Date.now() + 3600_000).toISOString() })
    await threadAction(opts, row.id, 'snooze', { wakeAt: new Date(Date.now() + 7200_000).toISOString() })
    const open = await sql`SELECT count(*)::int AS n FROM gmail_snoozes WHERE thread_id = ${row.id} AND woke_at IS NULL`
    expect(open[0]!.n).toBe(1)
    await threadAction(opts, row.id, 'unsnooze')
    const inbox = await waitFor(async () => (await listThreads(opts, { view: 'inbox' })).items.find(t => t.id === row.id))
    expect(inbox.wokenAt).not.toBeNull()
  })
})
