import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  cleanupCoreTestData,
  createTestUser,
  createPendingInvite
} from '../helpers'

describe('GET /api/auth/invite-info', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupCoreTestData(sql)
  })
  it('returns 400 when token is missing', async () => {
    const err = await $fetch('/api/auth/invite-info').catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('returns 404 for an unknown token', async () => {
    const err = await $fetch(`/api/auth/invite-info?token=${randomUUID()}`).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('returns 404 when token belongs to a verified user (not a pending invite)', async () => {
    const user = await createTestUser(sql, { verified: true })
    const tokenRows = await sql<{ token_key: string }[]>`SELECT token_key FROM users WHERE id = ${user.id}`
    const err = await $fetch(`/api/auth/invite-info?token=${tokenRows[0]!.token_key}`).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('returns 410 when token is expired', async () => {
    const invite = await createPendingInvite(sql, { expiresInMs: -1000 })
    const err = await $fetch(`/api/auth/invite-info?token=${invite.token}`).catch(e => e)
    expect(err.statusCode).toBe(410)
  })

  it('returns email + display_name + (empty) orgs for a valid pending invite', async () => {
    const invite = await createPendingInvite(sql, { display_name: 'Pending Person' })
    const res = await $fetch(`/api/auth/invite-info?token=${invite.token}`)
    expect(res.email).toBe(invite.email)
    expect(res.display_name).toBe('Pending Person')
    expect(Array.isArray(res.orgs)).toBe(true)
    // No memberships seeded → empty array
    expect(res.orgs.length).toBe(0)
  })
})
