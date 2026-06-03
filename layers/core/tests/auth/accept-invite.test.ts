import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import {
  getHostAdminDb,
  cleanupCoreTestData,
  createPendingInvite
} from '../helpers'

describe('POST /api/auth/accept-invite', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupCoreTestData(sql)
  })
  it('returns 400 when token is missing', async () => {
    const err = await $fetch('/api/auth/accept-invite', {
      method: 'POST',
      body: { password: 'password123', display_name: 'No Token' }
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('returns 400 when password is too short', async () => {
    const invite = await createPendingInvite(sql)
    const err = await $fetch('/api/auth/accept-invite', {
      method: 'POST',
      body: { token: invite.token, password: 'short', display_name: 'Short PW' }
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
    expect(String(err.statusMessage)).toMatch(/8 characters/i)
  })

  it('returns 400 when display_name is too short', async () => {
    const invite = await createPendingInvite(sql)
    const err = await $fetch('/api/auth/accept-invite', {
      method: 'POST',
      body: { token: invite.token, password: 'password123', display_name: 'X' }
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('returns 404 for an unknown token', async () => {
    const err = await $fetch('/api/auth/accept-invite', {
      method: 'POST',
      body: { token: randomUUID(), password: 'password123', display_name: 'Ghost' }
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('returns 410 when invite is expired', async () => {
    const invite = await createPendingInvite(sql, { expiresInMs: -1000 })
    const err = await $fetch('/api/auth/accept-invite', {
      method: 'POST',
      body: { token: invite.token, password: 'password123', display_name: 'Expired' }
    }).catch(e => e)
    expect(err.statusCode).toBe(410)
  })

  it('accepts invite: sets password + verified, rotates token, sets auth cookie, returns redirect', async () => {
    const invite = await createPendingInvite(sql)

    const res = await fetch('/api/auth/accept-invite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: invite.token, password: 'newpassword123', display_name: 'Accepted Name' })
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.redirect).toBe('/orgs')

    const setCookie = res.headers.get('set-cookie') || ''
    expect(setCookie).toMatch(/auth-token=/)

    const rows = await sql<{
      verified: boolean, password: string | null, display_name: string,
      token_key: string, token_expires_at: Date | null
    }[]>`SELECT verified, password, display_name, token_key, token_expires_at FROM users WHERE id = ${invite.userId}`
    expect(rows[0]!.verified).toBe(true)
    expect(rows[0]!.display_name).toBe('Accepted Name')
    expect(rows[0]!.password).toBeTruthy()
    expect(await bcrypt.compare('newpassword123', rows[0]!.password!)).toBe(true)
    expect(rows[0]!.token_key).not.toBe(invite.token) // rotated
    expect(rows[0]!.token_expires_at).toBeNull()
  })

  it('still accepts when the user was marked verified while pending (password=null)', async () => {
    // Regression: admin "Mark verified" on a pending invite must not break the
    // accept flow — it keys off password (null), not the verified flag.
    const invite = await createPendingInvite(sql)
    await sql`UPDATE users SET verified = true WHERE id = ${invite.userId}`

    const res = await fetch('/api/auth/accept-invite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: invite.token, password: 'newpassword123', display_name: 'Healed Name' })
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)

    const rows = await sql<{ verified: boolean, password: string | null }[]>`
      SELECT verified, password FROM users WHERE id = ${invite.userId}`
    expect(rows[0]!.verified).toBe(true)
    expect(rows[0]!.password).toBeTruthy()
    expect(await bcrypt.compare('newpassword123', rows[0]!.password!)).toBe(true)
  })

  it('second call against an already-accepted invite returns 410', async () => {
    const invite = await createPendingInvite(sql)

    await $fetch('/api/auth/accept-invite', {
      method: 'POST',
      body: { token: invite.token, password: 'password123', display_name: 'First' }
    })

    const err = await $fetch('/api/auth/accept-invite', {
      method: 'POST',
      body: { token: invite.token, password: 'password123', display_name: 'Second' }
    }).catch(e => e)
    // The token's been rotated, so the second call's lookup may 404. The
    // token-key-still-matches case (race window) returns 410. Either is correct.
    expect([404, 410]).toContain(err.statusCode)
  })
})
