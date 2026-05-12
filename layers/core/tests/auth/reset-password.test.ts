import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import {
  getHostAdminDb,
  cleanupCoreTestData,
  createTestUser
} from '../helpers'

async function seedResetToken(sql: ReturnType<typeof getHostAdminDb>, userId: string, opts: { used?: boolean, expiresInMs?: number } = {}) {
  const token = randomUUID()
  const expires = new Date(Date.now() + (opts.expiresInMs ?? 60 * 60 * 1000))
  await sql`
    INSERT INTO password_reset_requests (user_id, token, expires, used)
    VALUES (${userId}, ${token}, ${expires.toISOString()}, ${opts.used ?? false})
  `
  return token
}

describe('POST /api/auth/reset-password', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupCoreTestData(sql)
  })
  it('returns 400 when fields are missing', async () => {
    const err = await $fetch('/api/auth/reset-password', { method: 'POST', body: { token: 'x' } }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('returns 400 when passwords do not match', async () => {
    const err = await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token: 'x', password: 'aaaaaa', confirmPassword: 'bbbbbb' }
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
    expect(String(err.statusMessage)).toMatch(/do not match/i)
  })

  it('returns 400 when password is too short', async () => {
    const err = await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token: 'x', password: 'short', confirmPassword: 'short' }
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('returns 400 for an unknown / invalid token', async () => {
    const err = await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token: randomUUID(), password: 'newpw123', confirmPassword: 'newpw123' }
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
    expect(String(err.statusMessage)).toMatch(/invalid|expired/i)
  })

  it('returns 400 when token is expired', async () => {
    const user = await createTestUser(sql)
    const token = await seedResetToken(sql, user.id, { expiresInMs: -1000 })

    const err = await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token, password: 'newpw123', confirmPassword: 'newpw123' }
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('returns 400 when token has already been used', async () => {
    const user = await createTestUser(sql)
    const token = await seedResetToken(sql, user.id, { used: true })

    const err = await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token, password: 'newpw123', confirmPassword: 'newpw123' }
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('updates the password, marks token used, and the new password works for login', async () => {
    const user = await createTestUser(sql, { password: 'oldpassword' })
    const token = await seedResetToken(sql, user.id)

    const res = await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token, password: 'newpassword', confirmPassword: 'newpassword' }
    })
    expect(res.success).toBe(true)

    // DB: password is rehashed, token is marked used
    const rows = await sql<{ password: string }[]>`SELECT password FROM users WHERE id = ${user.id}`
    expect(await bcrypt.compare('newpassword', rows[0]!.password)).toBe(true)
    expect(await bcrypt.compare('oldpassword', rows[0]!.password)).toBe(false)

    const tokenRows = await sql<{ used: boolean }[]>`SELECT used FROM password_reset_requests WHERE token = ${token}`
    // Cleanup deletes used tokens; either it's gone or marked used. Both indicate success.
    if (tokenRows.length > 0) expect(tokenRows[0]!.used).toBe(true)

    // The new password lets the user log in
    const login = await $fetch('/api/auth/login', { method: 'POST', body: { email: user.email, password: 'newpassword' } })
    expect(login.success).toBe(true)
  })
})
