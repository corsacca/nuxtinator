import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupCoreTestData,
  createOperatorAdmin,
  createTestUser,
  createPendingInvite
} from '../helpers'

describe('POST /api/admin/users/:id/verify', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupCoreTestData(sql)
  })

  it('returns 409 for a pending invite (no password set yet) and leaves it unverified', async () => {
    // Marking a pending invitee verified used to strand their invite link.
    // The endpoint now refuses, mirroring send-verification / resend-invite.
    const { auth } = await createOperatorAdmin(sql)
    const invite = await createPendingInvite(sql)

    const err = await $fetch(`/api/admin/users/${invite.userId}/verify`, { method: 'POST', ...auth }).catch(e => e)
    expect(err.statusCode).toBe(409)
    expect(String(err.statusMessage)).toMatch(/not accepted their invite/i)

    // Must remain unverified so the invite link still works.
    const rows = await sql<{ verified: boolean }[]>`SELECT verified FROM users WHERE id = ${invite.userId}`
    expect(rows[0]!.verified).toBe(false)
  })

  it('verifies a self-registered user who has already set a password', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const user = await createTestUser(sql, { verified: false })

    const res = await $fetch(`/api/admin/users/${user.id}/verify`, { method: 'POST', ...auth })
    expect(res.user.verified).toBe(true)

    const rows = await sql<{ verified: boolean }[]>`SELECT verified FROM users WHERE id = ${user.id}`
    expect(rows[0]!.verified).toBe(true)
  })
})
