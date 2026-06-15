import jwt from 'jsonwebtoken'
import type { SignOptions } from 'jsonwebtoken'
import type { H3Event } from 'h3'

export interface AuthTokenPayload {
  userId: string
  email: string
  display_name: string
}

// A scoped token is a narrow, stateless credential a layer hands to a
// less-trusted holder (e.g. an embeddable widget on a third-party origin). It
// carries a `scope` claim and is NOT interchangeable with a full session:
// `verifyToken` (the session path) rejects any token that has a scope, and
// `verifyScopedToken` accepts only an exact scope match. Both are signed with
// the same `jwtSecret`, so the scope claim — not the key — is the boundary.
export function signScopedToken(payload: AuthTokenPayload, scope: string, expiresIn: string): string {
  return jwt.sign({ ...payload, scope }, useRuntimeConfig().jwtSecret, {
    expiresIn: expiresIn as SignOptions['expiresIn']
  })
}

export function verifyScopedToken(token: string, scope: string) {
  try {
    const decoded = jwt.verify(token, useRuntimeConfig().jwtSecret) as AuthTokenPayload & { scope?: string }
    return decoded.scope === scope ? decoded : null
  } catch {
    return null
  }
}

export function verifyToken(token: string) {
  try {
    const decoded = jwt.verify(token, useRuntimeConfig().jwtSecret) as AuthTokenPayload & { scope?: string }
    // A token carrying a scope is a narrow credential, never a full session.
    if (decoded.scope) return null
    return decoded
  } catch {
    return null
  }
}

export function requireAuth(event: H3Event) {
  const token = getCookie(event, 'auth-token')
  const user = token ? verifyToken(token) : null

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  return user
}

export function getAuthUser(event: H3Event) {
  const token = getCookie(event, 'auth-token')
  return token ? verifyToken(token) : null
}
