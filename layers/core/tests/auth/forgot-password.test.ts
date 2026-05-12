import { describe, it, expect, afterEach, afterAll, beforeEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  cleanupCoreTestData,
  createTestUser,
  waitForMailTo,
  extractTokenFromBody,
  clearMailhog
} from '../helpers'

describe('POST /api/auth/forgot-password', () => {
  const sql = getHostAdminDb()

  beforeEach(async () => {
    await clearMailhog()
  })

  afterEach(async () => {
    await cleanupCoreTestData(sql)
  })
  it('returns 400 when email is missing or invalid', async () => {
    const e1 = await $fetch('/api/auth/forgot-password', { method: 'POST', body: {} }).catch(e => e)
    expect(e1.statusCode).toBe(400)

    const e2 = await $fetch('/api/auth/forgot-password', { method: 'POST', body: { email: 'not-an-email' } }).catch(e => e)
    expect(e2.statusCode).toBe(400)
  })

  it('returns the same success response for unknown emails (no enumeration)', async () => {
    const res = await $fetch('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: `test-core-unknown-${randomUUID().slice(0, 8)}@example.com` }
    })
    expect(res.success).toBe(true)
    expect(res.message).toMatch(/if an account/i)

    // No row should be created in password_reset_requests for unknown emails
    const resets = await sql`SELECT count(*)::int as c FROM password_reset_requests`
    expect(resets[0]!.c).toBe(0)
  })

  it('creates a password_reset_requests row and sends email for an existing user', async () => {
    const user = await createTestUser(sql, { display_name: 'Reset Me' })

    const res = await $fetch('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: user.email }
    })
    expect(res.success).toBe(true)

    const rows = await sql<{ token: string, user_id: string, used: boolean }[]>`
      SELECT token, user_id, used FROM password_reset_requests WHERE user_id = ${user.id}
    `
    expect(rows.length).toBe(1)
    expect(rows[0]!.used).toBe(false)

    const msg = await waitForMailTo(user.email)
    const token = extractTokenFromBody(msg.body, 'token')
    expect(token).toBe(rows[0]!.token)
  })

  it('replaces prior reset rows for the same user (only one outstanding token)', async () => {
    const user = await createTestUser(sql)

    await $fetch('/api/auth/forgot-password', { method: 'POST', body: { email: user.email } })
    await $fetch('/api/auth/forgot-password', { method: 'POST', body: { email: user.email } })

    const rows = await sql<{ c: number }[]>`SELECT count(*)::int as c FROM password_reset_requests WHERE user_id = ${user.id}`
    expect(rows[0]!.c).toBe(1)
  })
})
