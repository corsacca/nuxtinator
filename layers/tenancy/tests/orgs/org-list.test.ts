import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupTenancyTestData,
  createTenancyUser,
  getAuthHeaders,
  createTestOrg,
  addTestMembership
} from '../helpers'

describe('GET /api/orgs (caller\'s memberships)', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupTenancyTestData(sql)
  })
  it('returns 401 when unauthenticated', async () => {
    const err = await $fetch('/api/orgs').catch(e => e)
    expect(err.statusCode).toBe(401)
  })

  it('returns empty list for a user with no memberships', async () => {
    const user = await createTenancyUser(sql)
    const res = await $fetch('/api/orgs', getAuthHeaders(user))
    expect(res.orgs).toEqual([])
  })

  it('returns the user\'s memberships joined with org details, sorted by name', async () => {
    const user = await createTenancyUser(sql)
    const orgZ = await createTestOrg(sql, { name: 'Zeta Co' })
    const orgA = await createTestOrg(sql, { name: 'Alpha Co' })
    await addTestMembership(sql, { user_id: user.id, org_id: orgZ.id, roles: ['admin'] })
    await addTestMembership(sql, { user_id: user.id, org_id: orgA.id, roles: ['member'] })

    const res = await $fetch('/api/orgs', getAuthHeaders(user))
    expect(res.orgs.length).toBe(2)
    expect(res.orgs[0].name).toBe('Alpha Co')
    expect(res.orgs[0].roles).toEqual(['member'])
    expect(res.orgs[1].name).toBe('Zeta Co')
    expect(res.orgs[1].roles).toEqual(['admin'])
  })

  it('does not leak orgs the caller is not a member of', async () => {
    const user = await createTenancyUser(sql)
    const otherUser = await createTenancyUser(sql)
    const myOrg = await createTestOrg(sql, { name: 'Mine' })
    const theirOrg = await createTestOrg(sql, { name: 'Theirs' })
    await addTestMembership(sql, { user_id: user.id, org_id: myOrg.id, roles: ['member'] })
    await addTestMembership(sql, { user_id: otherUser.id, org_id: theirOrg.id, roles: ['admin'] })

    const res = await $fetch('/api/orgs', getAuthHeaders(user))
    const names = res.orgs.map((o: { name: string }) => o.name)
    expect(names).toContain('Mine')
    expect(names).not.toContain('Theirs')
  })
})
