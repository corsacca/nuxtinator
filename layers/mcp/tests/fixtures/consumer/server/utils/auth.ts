import type { H3Event } from 'h3'

// Fixture stub. The real consumer reads a JWT from the auth-token cookie;
// MCP-layer integration tests don't exercise that path — bearer tokens flow
// through the OAuth layer. This stub returns null so the activity-logger's
// H3Event branch produces the same null user_id it does in the real
// consumer when MCP is the source.
export interface AuthUser {
  userId: string
  email?: string
}

export function getAuthUser(_event: H3Event): AuthUser | null {
  return null
}

export function requireAuth(_event: H3Event): AuthUser {
  throw createError({ statusCode: 401, statusMessage: 'Not implemented in fixture' })
}

export function verifyToken(_token: string): AuthUser | null {
  return null
}
