import jwt from 'jsonwebtoken'
import type { SignOptions } from 'jsonwebtoken'
import type { H3Event } from 'h3'

export interface AuthTokenPayload {
  userId: string
  email: string
  display_name: string
}

// Mints the same JWT the login endpoint issues (verified by `verifyToken` and
// accepted everywhere a bearer/cookie `auth-token` is read). `expiresIn` takes
// any `jsonwebtoken` duration string; defaults to the 120-day login lifetime.
export function signAuthToken(payload: AuthTokenPayload, expiresIn: string = '120d'): string {
  return jwt.sign(payload, useRuntimeConfig().jwtSecret, {
    expiresIn: expiresIn as SignOptions['expiresIn']
  })
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, useRuntimeConfig().jwtSecret) as { userId: string, email: string, display_name: string }
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
