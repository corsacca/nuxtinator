import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { verifyToken, getAuthUser as getCookieAuthUser } from '#core/server/utils/auth'

// Auth helper for the embeddable web component endpoints. Accepts BOTH the
// `auth-token` cookie (same-origin, in-app usage) AND `Authorization: Bearer
// <jwt>` (cross-origin, embedded on a third-party site). The widget stores
// the same JWT in localStorage and sends it as a Bearer header.
export function getWidgetAuthUser(event: H3Event) {
  const cookieUser = getCookieAuthUser(event)
  if (cookieUser) return cookieUser

  const authHeader = getHeader(event, 'authorization') || ''
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token) return verifyToken(token)
  }
  return null
}

export function requireWidgetAuthUser(event: H3Event) {
  const user = getWidgetAuthUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  return user
}
