import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { verifyScopedToken, getAuthUser as getCookieAuthUser } from '#core/server/utils/auth'

// Scope claim on the bearer tokens this layer mints for the embeddable widget.
// The token is a scoped credential (see #core signScopedToken) — it can never
// act as a full session, only at these widget endpoints.
export const WIDGET_TOKEN_SCOPE = 'feedback'

// Auth helper for the embeddable web component endpoints. Accepts BOTH the
// `auth-token` cookie (same-origin, in-app usage — a full session) AND
// `Authorization: Bearer <token>` (cross-origin embed), where the bearer is a
// feedback-scoped token the widget obtained via the sign-in flow.
export function getWidgetAuthUser(event: H3Event) {
  const cookieUser = getCookieAuthUser(event)
  if (cookieUser) return cookieUser

  const authHeader = getHeader(event, 'authorization') || ''
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token) return verifyScopedToken(token, WIDGET_TOKEN_SCOPE)
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
