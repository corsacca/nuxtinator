// User-initiated revoke for an OAuth client. Calls the shared
// `revokeConsentAndFamilies` helper so admin-side revoke and
// user-side revoke produce identical state — same DB writes, same
// audit shape, just a different reason code.

import { requireAuth } from '#core/server/utils/auth'
import { revokeConsentAndFamilies } from '../../../../utils/oauth-revoke'
import { logOauthEvent, OAUTH_EVENTS } from '../../../../utils/oauth-audit'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const clientId = getRouterParam(event, 'client_id')

  if (!clientId || typeof clientId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'client_id is required' })
  }

  const result = await revokeConsentAndFamilies(user.userId, clientId, 'user_revoked')

  // Always log — even if nothing was revoked (idempotent UX) the
  // attempt is worth recording. The metadata distinguishes a real
  // revoke from a no-op (consentsRevoked === 0).
  logOauthEvent({
    event: OAUTH_EVENTS.CONSENT_REVOKED,
    userId: user.userId,
    event3: event,
    metadata: {
      client_id: clientId,
      reason: 'user_revoked',
      consents_revoked: result.consentsRevoked,
      families_revoked: result.familiesRevoked
    }
  })

  return {
    ok: true,
    consents_revoked: result.consentsRevoked,
    families_revoked: result.familiesRevoked
  }
})
