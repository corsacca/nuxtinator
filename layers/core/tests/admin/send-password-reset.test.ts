import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupCoreTestData,
  createOperatorAdmin,
  createTestUser,
  createPendingInvite,
  waitForMailTo,
  extractTokenFromBody,
  clearMailhog
} from '../helpers'

describe('POST /api/admin/users/:id/send-password-reset', () => {
  const sql = getHostAdminDb()

  beforeEach(async () => {
    await clearMailhog()
  })

  afterEach(async () => {
    await cleanupCoreTestData(sql)
  })

  it('creates a reset row and emails the user when a password is set', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const user = await createTestUser(sql, { display_name: 'Reset Target' })

    const res = await $fetch(`/api/admin/users/${user.id}/send-password-reset`, { method: 'POST', ...auth })
    expect(res.success).toBe(true)

    const rows = await sql<{ token: string, used: boolean }[]>`
      SELECT token, used FROM password_reset_requests WHERE user_id = ${user.id}`
    expect(rows.length).toBe(1)
    expect(rows[0]!.used).toBe(false)

    const msg = await waitForMailTo(user.email)
    expect(extractTokenFromBody(msg.body, 'token')).toBe(rows[0]!.token)
  })

  it('returns 409 for a pending invite (no password set) and creates no reset row', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const invite = await createPendingInvite(sql)

    const err = await $fetch(`/api/admin/users/${invite.userId}/send-password-reset`, { method: 'POST', ...auth }).catch(e => e)
    expect(err.statusCode).toBe(409)
    expect(String(err.statusMessage)).toMatch(/not accepted their invite/i)

    const rows = await sql<{ c: number }[]>`SELECT count(*)::int as c FROM password_reset_requests WHERE user_id = ${invite.userId}`
    expect(rows[0]!.c).toBe(0)
  })
})
