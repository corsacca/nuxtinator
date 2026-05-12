// Helper to seed a pending-invite user (password=null, verified=false, with a
// token_key + token_expires_at). Used by both core invite-acceptance tests
// and (indirectly) by the tenancy invite tests that test the same path.
import type postgres from 'postgres'
import { randomUUID } from 'node:crypto'

export interface PendingInvite {
  userId: string
  email: string
  display_name: string
  token: string
  expiresAt: string
}

export async function createPendingInvite(
  sql: ReturnType<typeof postgres>,
  opts: {
    email?: string
    display_name?: string
    expiresInMs?: number
  } = {}
): Promise<PendingInvite> {
  const userId = randomUUID()
  const email = opts.email ?? `test-core-invite-${randomUUID().slice(0, 8)}@example.com`
  const display_name = opts.display_name ?? 'Pending Invite'
  const token = randomUUID()
  const expiresInMs = opts.expiresInMs ?? 7 * 24 * 60 * 60 * 1000
  const expiresAt = new Date(Date.now() + expiresInMs).toISOString()
  const now = new Date().toISOString()

  await sql`
    INSERT INTO users (id, created, updated, email, display_name, avatar, password, verified, is_admin, token_key, token_expires_at)
    VALUES (${userId}, ${now}, ${now}, ${email}, ${display_name}, '', NULL, false, false, ${token}, ${expiresAt})
  `

  return { userId, email, display_name, token, expiresAt }
}
