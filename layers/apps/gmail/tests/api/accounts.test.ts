// Connecting accounts: Gmail's verdict on credentials and folder visibility
// surfaces verbatim, a connected account syncs its seeded mail, accounts are
// per user (shared across orgs, invisible to other users), and disconnecting
// removes the mirror.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb, cleanupGmailTestData, createGmailOrgWith, createTestOrg, addTestMembership, withOrgHeader,
  enableGmailForOrg, seedMailbox, deliver, connectAccount, syncAccount, listThreads, fakeAddress, type AccountView
} from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => {
  await cleanupGmailTestData(sql)
})

describe('accounts', () => {
  it('rejects a bad app password with Gmail\'s message', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email, 'right-password')
    await expect(connectAccount(opts, email, 'wrong-password')).rejects.toMatchObject({ statusCode: 400 })
    await expect(connectAccount(opts, email, 'wrong-password')).rejects.toMatchObject({ data: { statusMessage: expect.stringMatching(/rejected/i) } })
  })

  it('explains when All Mail is hidden from IMAP', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email, 'app-password-1234', { hideAllMail: true })
    await expect(connectAccount(opts, email)).rejects.toMatchObject({ data: { statusMessage: expect.stringMatching(/Show in IMAP/) } })
  })

  it('connects, syncs seeded mail, and lists accounts without secrets', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email)
    await deliver(email, { from: 'Jane <jane@sender.example>', subject: 'Hello there', text: 'First message' })
    const account = await connectAccount(opts, email, 'app-password-1234', 'Test Person')
    expect(account.email).toBe(email)
    expect(account.displayName).toBe('Test Person')
    expect(account.status).toBe('connecting')
    expect(JSON.stringify(account)).not.toContain('app-password')

    await syncAccount(opts, account.id)
    const list = await $fetch<{ accounts: AccountView[] }>('/api/gmail/accounts', opts)
    expect(list.accounts).toHaveLength(1)
    expect(list.accounts[0]!.status).toBe('active')
    expect(list.accounts[0]!.backfillDone).toBe(true)

    const { items } = await listThreads(opts)
    expect(items).toHaveLength(1)
    expect(items[0]!.subject).toBe('Hello there')
    expect(items[0]!.accountEmail).toBe(email)
    expect(items[0]!.unreadCount).toBe(1)
  })

  it('rejects connecting the same address twice', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email)
    await connectAccount(opts, email)
    await expect(connectAccount(opts, email)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('accounts follow the user across orgs and stay invisible to other users', async () => {
    const { opts, user } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email)
    await deliver(email, { from: 'jane@sender.example', subject: 'Cross-org', text: 'x' })
    const account = await connectAccount(opts, email)
    await syncAccount(opts, account.id)

    const org2 = await createTestOrg(sql, { slug: `test-gmail-${randomUUID().slice(0, 8)}` })
    await addTestMembership(sql, { user_id: user.id, org_id: org2.id, roles: ['admin'] })
    await enableGmailForOrg(sql, org2.id)
    const opts2 = withOrgHeader({ headers: { cookie: opts.headers.cookie } }, org2.slug)
    const list2 = await $fetch<{ accounts: AccountView[] }>('/api/gmail/accounts', opts2)
    expect(list2.accounts.map(a => a.email)).toEqual([email])
    const threads2 = await listThreads(opts2)
    expect(threads2.items.map(t => t.subject)).toEqual(['Cross-org'])

    const other = await createGmailOrgWith(sql)
    const listOther = await $fetch<{ accounts: AccountView[] }>('/api/gmail/accounts', other.opts)
    expect(listOther.accounts).toHaveLength(0)
    const threadsOther = await listThreads(other.opts)
    expect(threadsOther.items).toHaveLength(0)
    await expect($fetch(`/api/gmail/threads/${threads2.items[0]!.id}`, other.opts)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('updates profile fields and re-verifies a new password; disconnect removes the mirror', async () => {
    const { opts } = await createGmailOrgWith(sql)
    const email = fakeAddress()
    await seedMailbox(email, 'app-password-1234')
    await deliver(email, { from: 'jane@sender.example', subject: 'Gone soon', text: 'x' })
    const account = await connectAccount(opts, email)
    await syncAccount(opts, account.id)

    const patched = await $fetch<{ account: AccountView }>(`/api/gmail/accounts/${account.id}`, {
      method: 'PATCH', body: { displayName: 'New Name', signatureHtml: '<p>Cheers</p><script>x()</script>' }, ...opts
    })
    expect(patched.account.displayName).toBe('New Name')
    expect(patched.account.signatureHtml).toBe('<p>Cheers</p>')

    await expect($fetch(`/api/gmail/accounts/${account.id}`, { method: 'PATCH', body: { password: 'nope-nope-nope' }, ...opts }))
      .rejects.toMatchObject({ statusCode: 400 })

    await $fetch(`/api/gmail/accounts/${account.id}`, { method: 'DELETE', ...opts })
    const list = await $fetch<{ accounts: AccountView[] }>('/api/gmail/accounts', opts)
    expect(list.accounts).toHaveLength(0)
    const { items } = await listThreads(opts, { view: 'all' })
    expect(items).toHaveLength(0)
    const rows = await sql`SELECT count(*)::int AS n FROM gmail_messages WHERE account_id = ${account.id}`
    expect(rows[0]!.n).toBe(0)
  })

  it('gates the app on gmail.access', async () => {
    const { opts } = await createGmailOrgWith(sql, ['member'])
    await expect($fetch('/api/gmail/accounts', opts)).rejects.toMatchObject({ statusCode: 403 })
  })
})
