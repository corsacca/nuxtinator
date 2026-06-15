/**
 * GET /api/v1/feedback/me — current widget user identity.
 *
 * Bearer-aware (via getWidgetAuthUser) so it works both first-party (host
 * `auth-token` cookie) and cross-origin (the bearer token issued by
 * /api/v1/feedback/token). The widget uses this in place of /api/auth/me,
 * which is cookie-only and so can't authenticate a cross-origin embed.
 */
import { requireWidgetAuthUser } from '../../../../utils/widget-auth'

export default defineEventHandler((event) => {
  const u = requireWidgetAuthUser(event)
  return { user: { id: u.userId, email: u.email, display_name: u.display_name } }
})
