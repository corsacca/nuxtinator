// Gmail-layer test helpers. Re-exports the tenancy + core helpers and adds:
// org bootstrap with the gmail app enabled, fake-mailbox seeding through the
// /api/gmail/_test/* seams, and prefix-scoped cleanup.
//
// All seeded users/orgs are prefixed `test-gmail-` so cleanup stays scoped;
// every gmail_* row cascades off its user.
import type postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  createTestUser,
  getAuthHeaders,
  withOrgHeader,
  type AuthHeaders,
  type TestUser,
  createTestOrg,
  addTestMembership,
  type TestOrg
} from 'layer-tenancy/test-helpers'

export * from 'layer-tenancy/test-helpers'

export type OrgOpts = ReturnType<typeof withOrgHeader>

export async function createGmailUser(sql: ReturnType<typeof postgres>): Promise<TestUser> {
  return createTestUser(sql, { email: `test-gmail-${randomUUID().slice(0, 8)}@example.com` })
}

export async function createGmailOrgWith(
  sql: ReturnType<typeof postgres>,
  roles: string[] = ['admin']
): Promise<{ org: TestOrg, user: TestUser, auth: AuthHeaders, opts: OrgOpts }> {
  const user = await createGmailUser(sql)
  const org = await createTestOrg(sql, { slug: `test-gmail-${randomUUID().slice(0, 8)}`, name: 'Test Gmail Org' })
  await addTestMembership(sql, { user_id: user.id, org_id: org.id, roles })
  await enableGmailForOrg(sql, org.id)
  return { org, user, auth: getAuthHeaders(user), opts: withOrgHeader(getAuthHeaders(user), org.slug) }
}

export async function enableGmailForOrg(sql: ReturnType<typeof postgres>, orgId: string): Promise<void> {
  await sql`INSERT INTO apps (id, status) VALUES ('gmail', 'available') ON CONFLICT (id) DO NOTHING`
  await sql`
    INSERT INTO org_apps (org_id, app_id, enabled, source)
    VALUES (${orgId}, 'gmail', true, 'org_admin')
    ON CONFLICT DO NOTHING
  `
}

// --- Fake mailbox seams ---------------------------------------------------

export function fakeAddress(tag = 'box'): string {
  return `test-gmail-${tag}-${randomUUID().slice(0, 8)}@gmail.test`
}

export async function seedMailbox(email: string, password = 'app-password-1234', extra: { labels?: string[], hideAllMail?: boolean } = {}): Promise<void> {
  await $fetch('/api/gmail/_test/seed', { method: 'POST', body: { email, password, ...extra } })
}

export interface DeliverOpts {
  from: string | { name?: string | null, address: string }
  to?: (string | { name?: string | null, address: string })[]
  cc?: (string | { name?: string | null, address: string })[]
  subject?: string
  text?: string
  html?: string | null
  date?: string
  messageId?: string
  inReplyTo?: string | null
  references?: string | null
  labels?: string[]
  flags?: string[]
  folder?: 'all' | 'trash' | 'spam'
  gmThrId?: string
  attachments?: { filename: string, contentType: string, content: string, encoding?: 'utf8' | 'base64' }[]
}

export async function deliver(email: string, message: DeliverOpts): Promise<{ gmMsgId: string, gmThrId: string, uid: number, messageId: string }> {
  return await $fetch('/api/gmail/_test/deliver', { method: 'POST', body: { email, message } })
}

export async function fakeStore(email: string, gmMsgId: string, change: { addFlags?: string[], removeFlags?: string[], addLabels?: string[], removeLabels?: string[] }): Promise<void> {
  await $fetch('/api/gmail/_test/store', { method: 'POST', body: { email, gmMsgId, ...change } })
}

export async function fakeMessage(email: string, gmMsgId: string): Promise<{ folder: string, uid: number, flags: string[], labels: string[] } | null> {
  const res = await $fetch<{ message: { folder: string, uid: number, flags: string[], labels: string[] } | null }>('/api/gmail/_test/message', { params: { email, gmMsgId } })
  return res.message
}

export interface SentMail {
  from: { name: string | null, address: string }
  to: { name: string | null, address: string }[]
  cc: { name: string | null, address: string }[]
  bcc: { name: string | null, address: string }[]
  subject: string
  html: string
  text: string
  messageId: string
  inReplyTo: string | null
  references: string | null
  attachments: { filename: string, contentType: string, size: number }[]
}

export async function listSent(email: string): Promise<SentMail[]> {
  const res = await $fetch<{ sent: SentMail[] }>('/api/gmail/_test/sent', { params: { email } })
  return res.sent
}

// Runs the session tick, wake sweep and send sweep immediately.
export async function sweep(): Promise<{ woke: number, sent: number }> {
  return await $fetch('/api/gmail/_test/sweep', { method: 'POST' })
}

// --- App API shortcuts ----------------------------------------------------

export interface AccountView {
  id: string
  email: string
  displayName: string | null
  signatureHtml: string | null
  status: string
  lastError: string | null
  backfillDone: boolean
  lastSyncAt: string | null
}

export async function connectAccount(opts: OrgOpts, email: string, password = 'app-password-1234', displayName?: string): Promise<AccountView> {
  const res = await $fetch<{ account: AccountView }>('/api/gmail/accounts', { method: 'POST', body: { email, password, displayName }, ...opts })
  return res.account
}

// A seeded mailbox connected and fully synced.
export async function connectSyncedAccount(opts: OrgOpts, email: string): Promise<AccountView> {
  await seedMailbox(email)
  const account = await connectAccount(opts, email)
  await syncAccount(opts, account.id)
  return account
}

export async function syncAccount(opts: OrgOpts, accountId: string): Promise<void> {
  await $fetch(`/api/gmail/accounts/${accountId}/sync`, { method: 'POST', ...opts })
}

export interface ThreadRow {
  id: string
  accountId: string
  accountEmail: string
  subject: string | null
  snippet: string | null
  participants: { name: string | null, address: string }[]
  messageCount: number
  unreadCount: number
  hasAttachments: boolean
  isStarred: boolean
  inInbox: boolean
  labels: string[]
  lastMessageAt: string | null
  sortAt: string
  snoozedUntil: string | null
  wokenAt: string | null
}

export async function listThreads(opts: OrgOpts, params: Record<string, string> = {}): Promise<{ items: ThreadRow[], total: number }> {
  return await $fetch('/api/gmail/threads', { params, ...opts })
}

export interface ThreadDetail {
  thread: ThreadRow & { isImportant: boolean, hasSent: boolean, spamCount: number, trashCount: number }
  messages: {
    id: string
    folder: string
    messageId: string | null
    fromAddr: string | null
    fromName: string | null
    to: { name: string | null, address: string }[]
    cc: { name: string | null, address: string }[]
    subject: string | null
    snippet: string | null
    internalDate: string
    labels: string[]
    isUnread: boolean
    isStarred: boolean
    hasAttachments: boolean
    bodyFetched: boolean
    bodyHtml: string | null
    bodyText: string | null
    attachments: { index: number, filename: string | null, contentType: string, size: number, cid: string | null, inline: boolean }[]
  }[]
}

export async function getThread(opts: OrgOpts, id: string): Promise<ThreadDetail> {
  return await $fetch(`/api/gmail/threads/${id}`, opts)
}

export async function threadAction(opts: OrgOpts, id: string, action: string, extra: { label?: string, wakeAt?: string } = {}): Promise<void> {
  await $fetch(`/api/gmail/threads/${id}/actions`, { method: 'POST', body: { action, ...extra }, ...opts })
}

export async function findThreadBySubject(opts: OrgOpts, subject: string, params: Record<string, string> = { view: 'all' }): Promise<ThreadRow | undefined> {
  const { items } = await listThreads(opts, params)
  return items.find(t => t.subject === subject)
}

export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 8000, everyMs = 200): Promise<T> {
  const start = Date.now()
  let last: unknown
  while (Date.now() - start < timeoutMs) {
    try {
      const v = await fn()
      if (v) return v as T
    } catch (err) {
      last = err
    }
    await new Promise(r => setTimeout(r, everyMs))
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms${last ? `: ${(last as Error).message}` : ''}`)
}

// --- Cleanup -------------------------------------------------------------

export async function cleanupGmailTestData(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`DELETE FROM orgs WHERE slug LIKE 'test-gmail-%'`
  await sql`DELETE FROM users WHERE email LIKE 'test-gmail-%'`
  try {
    await $fetch('/api/gmail/_test/reset', { method: 'POST' })
  } catch {
    // The server is not up during global setup's first pass.
  }
}
