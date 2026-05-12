// Host-admin multi-org invite. Lives in core but requires tenancy (orgs +
// memberships tables, requireOperatorAdmin from #tenant/server).
//
// Two paths:
//   - new email   → creates user with password=null + memberships + invite email
//   - existing email → silent attach: only memberships, no email
import { describe, it, expect, afterEach, afterAll, beforeEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  cleanupTenancyTestData,
  createOperatorAdmin,
  createTenancyUser,
  createTestOrg,
  waitForMailTo,
  extractTokenFromBody,
  clearMailhog
} from '../helpers'

describe('POST /api/admin/users/invite (host-admin multi-org)', () => {
  const sql = getHostAdminDb()

  beforeEach(async () => {
    await clearMailhog()
  })

  afterEach(async () => {
    await cleanupTenancyTestData(sql)
  })
  it('returns 400 with invalid email', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const org = await createTestOrg(sql)
    const err = await $fetch('/api/admin/users/invite', {
      method: 'POST',
      body: { email: 'not-an-email', display_name: 'X', attachments: [{ orgId: org.id, roles: ['member'] }] },
      ...auth
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('returns 400 when attachments is empty', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const err = await $fetch('/api/admin/users/invite', {
      method: 'POST',
      body: { email: `test-tenancy-${randomUUID().slice(0, 8)}@example.com`, display_name: 'Bob', attachments: [] },
      ...auth
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('returns 400 when an attachment org does not exist', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const err = await $fetch('/api/admin/users/invite', {
      method: 'POST',
      body: {
        email: `test-tenancy-${randomUUID().slice(0, 8)}@example.com`,
        display_name: 'Ghost',
        attachments: [{ orgId: randomUUID(), roles: ['member'] }]
      },
      ...auth
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('new email → creates user (password null), memberships, and sends invite email', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const orgA = await createTestOrg(sql)
    const orgB = await createTestOrg(sql)
    const email = `test-tenancy-invite-${randomUUID().slice(0, 8)}@example.com`

    const res = await $fetch('/api/admin/users/invite', {
      method: 'POST',
      body: {
        email,
        display_name: 'Multi Org User',
        attachments: [
          { orgId: orgA.id, roles: ['admin'] },
          { orgId: orgB.id, roles: ['member'] }
        ]
      },
      ...auth
    })

    expect(res.user.email).toBe(email)
    expect(res.attachments.every((a: { status: string }) => a.status === 'pending')).toBe(true)

    // User exists with password null (pending invite)
    const userRows = await sql<{ password: string | null, verified: boolean, token_key: string, token_expires_at: Date | null }[]>`
      SELECT password, verified, token_key, token_expires_at FROM users WHERE email = ${email}
    `
    expect(userRows.length).toBe(1)
    expect(userRows[0]!.password).toBeNull()
    expect(userRows[0]!.verified).toBe(false)
    expect(userRows[0]!.token_expires_at).not.toBeNull()

    // Two memberships
    const memberships = await sql<{ org_id: string, roles: string[] }[]>`
      SELECT org_id, roles FROM memberships WHERE user_id = ${res.user.id}
    `
    expect(memberships.length).toBe(2)
    const orgARow = memberships.find(m => m.org_id === orgA.id)!
    const orgBRow = memberships.find(m => m.org_id === orgB.id)!
    expect(orgARow.roles).toEqual(['admin'])
    expect(orgBRow.roles).toEqual(['member'])

    // Single invite email
    const msg = await waitForMailTo(email)
    const token = extractTokenFromBody(msg.body, 'token')
    expect(token).toBe(userRows[0]!.token_key)
  })

  it('existing email → silent attach (memberships added, no email sent)', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const orgA = await createTestOrg(sql)
    const existing = await createTenancyUser(sql)

    const res = await $fetch('/api/admin/users/invite', {
      method: 'POST',
      body: {
        email: existing.email,
        attachments: [{ orgId: orgA.id, roles: ['member'] }]
      },
      ...auth
    })
    expect(res.attachments[0].status).toBe('attached')

    const memberships = await sql<{ c: number }[]>`SELECT count(*)::int as c FROM memberships WHERE user_id = ${existing.id} AND org_id = ${orgA.id}`
    expect(memberships[0]!.c).toBe(1)

    // No email captured for an attach
    let mailErr: unknown = null
    try { await waitForMailTo(existing.email, 1000) } catch (e) { mailErr = e }
    expect(mailErr).not.toBeNull()
  })

  it('returns 409 when existing user is already a member of one of the requested orgs', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const orgA = await createTestOrg(sql)
    const existing = await createTenancyUser(sql)
    await sql`
      INSERT INTO memberships (id, user_id, org_id, roles)
      VALUES (${randomUUID()}, ${existing.id}, ${orgA.id}, ${'{member}'})
    `

    const err = await $fetch('/api/admin/users/invite', {
      method: 'POST',
      body: {
        email: existing.email,
        attachments: [{ orgId: orgA.id, roles: ['admin'] }]
      },
      ...auth
    }).catch(e => e)
    expect(err.statusCode).toBe(409)
  })

  it('non-operator-admin gets 403', async () => {
    const user = await createTenancyUser(sql)
    const org = await createTestOrg(sql)
    const { getAuthHeaders } = await import('../helpers')

    const err = await $fetch('/api/admin/users/invite', {
      method: 'POST',
      body: {
        email: `test-tenancy-${randomUUID().slice(0, 8)}@example.com`,
        display_name: 'X',
        attachments: [{ orgId: org.id, roles: ['member'] }]
      },
      ...getAuthHeaders(user)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })
})
