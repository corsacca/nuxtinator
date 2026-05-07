// Admin: revoke a single OAuth token family. Cascades to every
// non-revoked access + refresh token in the family. The user-side
// "Revoke connected app" goes wider (revoke consent + every family
// for that user × client); admin family-revoke is more surgical
// and leaves the consent intact, so the user can re-authorise the
// same client without re-consenting.

import { db } from '#core/server/utils/database'
import { requireOperatorAdmin } from '#tenant/server'
import { revokeFamily } from '../../../../../utils/oauth-revoke'
import { logOauthEvent, OAUTH_EVENTS } from '../../../../../utils/oauth-audit'

export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)

  const familyId = getRouterParam(event, 'family_id')
  if (!familyId || typeof familyId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'family_id is required' })
  }

  const family = await db
    .selectFrom('oauth_token_families')
    .select(['family_id', 'user_id', 'client_id', 'revoked'])
    .where('family_id', '=', familyId)
    .executeTakeFirst()

  if (!family) {
    throw createError({ statusCode: 404, statusMessage: 'Token family not found' })
  }

  if (family.revoked) {
    return { ok: true, family_id: familyId, already_revoked: true }
  }

  await revokeFamily(familyId, 'admin_revoked')

  logOauthEvent({
    event: OAUTH_EVENTS.FAMILY_REVOKED_BY_ADMIN,
    userId: family.user_id,
    event3: event,
    metadata: {
      family_id: familyId,
      client_id: family.client_id,
      affected_user_id: family.user_id
    }
  })

  return { ok: true, family_id: familyId, already_revoked: false }
})
