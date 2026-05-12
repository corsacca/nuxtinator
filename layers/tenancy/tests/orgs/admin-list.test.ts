import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupTenancyTestData,
  createOperatorAdmin,
  createTenancyUser,
  getAuthHeaders,
  createTestOrg
} from '../helpers'

describe('GET /api/admin/orgs (list)', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupTenancyTestData(sql)
  })
  it('returns 403 when caller is not an operator admin', async () => {
    const user = await createTenancyUser(sql)
    const err = await $fetch('/api/admin/orgs', getAuthHeaders(user)).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('returns the org list with member_count + app_count', async () => {
    const { auth } = await createOperatorAdmin(sql)
    await createTestOrg(sql, { name: 'A Org' })
    await createTestOrg(sql, { name: 'Z Org' })

    const res = await $fetch('/api/admin/orgs', auth)
    expect(Array.isArray(res.orgs)).toBe(true)

    const created = res.orgs.filter((o: { slug: string }) => o.slug.startsWith('test-tenancy-'))
    expect(created.length).toBeGreaterThanOrEqual(2)

    for (const o of created) {
      expect(typeof o.member_count).toBe('number')
      expect(typeof o.app_count).toBe('number')
      expect(typeof o.suspended).toBe('boolean')
    }

    // Sorted by name asc
    const names = created.map((o: { name: string }) => o.name)
    expect([...names].sort()).toEqual(names)
  })
})
