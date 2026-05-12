// POST /api/o/[orgSlug]/invite — per-org invite. Requires org.members.invite.
// Subset-delegation: cannot grant a permission you don't hold yourself.
import { describe, it, expect, afterEach, afterAll, beforeEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  cleanupTenancyTestData,
  createOrgWithAdmin,
  createTenancyUser,
  addTestMembership,
  withOrgHeader,
  getAuthHeaders,
  waitForMailTo,
  extractTokenFromBody,
  clearMailhog
} from '../helpers'

describe('POST /api/o/[orgSlug]/invite', () => {
  const sql = getHostAdminDb()

  beforeEach(async () => {
    await clearMailhog()
  })

  afterEach(async () => {
    await cleanupTenancyTestData(sql)
  })
  it('returns 403 when caller lacks org.members.invite (member role)', async () => {
    const { org } = await createOrgWithAdmin(sql)
    const member = await createTenancyUser(sql)
    await addTestMembership(sql, { user_id: member.id, org_id: org.id, roles: ['member'] })

    const err = await $fetch(`/api/o/${org.slug}/invite`, {
      method: 'POST',
      body: { email: 'someone@example.com', display_name: 'X', roles: ['member'] },
      ...withOrgHeader(getAuthHeaders(member), org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('returns 400 for invalid email', async () => {
    const { org, auth } = await createOrgWithAdmin(sql)
    const err = await $fetch(`/api/o/${org.slug}/invite`, {
      method: 'POST',
      body: { email: 'not-an-email', display_name: 'X', roles: ['member'] },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('admin invites a new email → user (password null) + membership + email sent', async () => {
    const { org, auth } = await createOrgWithAdmin(sql)
    const email = `test-tenancy-orginvite-${randomUUID().slice(0, 8)}@example.com`

    const res = await $fetch(`/api/o/${org.slug}/invite`, {
      method: 'POST',
      body: { email, display_name: 'New Person', roles: ['member'] },
      ...withOrgHeader(auth, org.slug)
    })
    expect(res.status).toBe('pending')

    const userRows = await sql<{ id: string, password: string | null, token_key: string }[]>`
      SELECT id, password, token_key FROM users WHERE email = ${email}
    `
    expect(userRows[0]!.password).toBeNull()

    const memberships = await sql<{ c: number }[]>`
      SELECT count(*)::int as c FROM memberships WHERE user_id = ${userRows[0]!.id} AND org_id = ${org.id}
    `
    expect(memberships[0]!.c).toBe(1)

    const msg = await waitForMailTo(email)
    const token = extractTokenFromBody(msg.body, 'token')
    expect(token).toBe(userRows[0]!.token_key)
  })

  it('admin attaches an existing user → no email sent, membership created', async () => {
    const { org, auth } = await createOrgWithAdmin(sql)
    const existing = await createTenancyUser(sql)

    const res = await $fetch(`/api/o/${org.slug}/invite`, {
      method: 'POST',
      body: { email: existing.email, roles: ['member'] },
      ...withOrgHeader(auth, org.slug)
    })
    expect(res.status).toBe('attached')

    const memberships = await sql<{ c: number }[]>`
      SELECT count(*)::int as c FROM memberships WHERE user_id = ${existing.id} AND org_id = ${org.id}
    `
    expect(memberships[0]!.c).toBe(1)

    let mailErr: unknown = null
    try { await waitForMailTo(existing.email, 800) } catch (e) { mailErr = e }
    expect(mailErr).not.toBeNull()
  })

  it('returns 409 when target is already a member', async () => {
    const { org, auth } = await createOrgWithAdmin(sql)
    const existing = await createTenancyUser(sql)
    await addTestMembership(sql, { user_id: existing.id, org_id: org.id, roles: ['member'] })

    const err = await $fetch(`/api/o/${org.slug}/invite`, {
      method: 'POST',
      body: { email: existing.email, roles: ['member'] },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(409)
  })

  it('returns 400 for an unknown role name', async () => {
    const { org, auth } = await createOrgWithAdmin(sql)
    const err = await $fetch(`/api/o/${org.slug}/invite`, {
      method: 'POST',
      body: { email: `test-tenancy-${randomUUID().slice(0, 8)}@example.com`, display_name: 'X', roles: ['fake_role'] },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('admin can invite at the admin role (admin holds every permission)', async () => {
    const { org, auth } = await createOrgWithAdmin(sql)
    const email = `test-tenancy-${randomUUID().slice(0, 8)}@example.com`

    const res = await $fetch(`/api/o/${org.slug}/invite`, {
      method: 'POST',
      body: { email, display_name: 'New Admin', roles: ['admin'] },
      ...withOrgHeader(auth, org.slug)
    })
    expect(res.status).toBe('pending')
    expect(res.membership.roles).toEqual(['admin'])
  })
})
