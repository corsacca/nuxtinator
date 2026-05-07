import jwt from 'jsonwebtoken'
import type { H3Event } from 'h3'

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
