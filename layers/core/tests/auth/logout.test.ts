import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupCoreTestData,
  createTestUser,
  generateTestToken
} from '../helpers'

describe('POST /api/auth/logout', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupCoreTestData(sql)
  })
  it('returns success and clears the auth cookie when called with one', async () => {
    const user = await createTestUser(sql)
    const token = generateTestToken(user)

    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { cookie: `auth-token=${token}` }
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)

    // Set-Cookie should expire the auth-token (Max-Age=0)
    const setCookie = res.headers.get('set-cookie') || ''
    expect(setCookie).toMatch(/auth-token=/)
    expect(setCookie).toMatch(/Max-Age=0/i)
  })

  it('still returns success when called without an auth cookie', async () => {
    const res = await fetch('/api/auth/logout', { method: 'POST' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })
})
