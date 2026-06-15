/**
 * POST /api/v1/feedback/token — second leg of the widget sign-in flow.
 *
 * Called CROSS-ORIGIN by the embeddable widget (CORS-enabled) with the
 * authorization code it received on the redirect plus its PKCE verifier.
 * Atomically claims the single-use code, verifies PKCE + origin, and returns
 * the access token (a standard `auth-token` JWT) the widget then sends as a
 * bearer on subsequent calls.
 */
import { readBody, getHeader } from 'h3'
import { db } from '#core/server/utils/database'
import { decryptSecret } from '#core/server/utils/secret-crypto'
import { verifyToken } from '#core/server/utils/auth'
import { widgetSha256Hex, widgetS256Challenge, isValidWidgetVerifier, widgetTimingSafeEqual } from '../../../../utils/widget-crypto'
import { originOf } from '../../../../utils/widget-origins'

export default defineEventHandler(async (event) => {
  const body = await readBody(event) ?? {}
  const code = typeof body.code === 'string' ? body.code : ''
  const verifier = typeof body.code_verifier === 'string' ? body.code_verifier : ''

  if (!code || !isValidWidgetVerifier(verifier)) {
    throw createError({ statusCode: 400, statusMessage: 'code and valid code_verifier required' })
  }

  // Atomically claim the code: only an unused, unexpired row flips to used, so a
  // replayed code finds nothing to claim.
  const row = await db
    .updateTable('feedback_auth_codes')
    .set({ used: true })
    .where('code_hash', '=', widgetSha256Hex(code))
    .where('used', '=', false)
    .where('expires', '>', new Date())
    .returningAll()
    .executeTakeFirst()

  if (!row) throw createError({ statusCode: 400, statusMessage: 'invalid or expired code' })

  // PKCE: the verifier must hash to the challenge bound at authorize time.
  if (!widgetTimingSafeEqual(widgetS256Challenge(verifier), row.code_challenge)) {
    throw createError({ statusCode: 400, statusMessage: 'PKCE verification failed' })
  }

  // Defense in depth: the exchange must come from the origin the code was for.
  const reqOrigin = originOf(getHeader(event, 'origin') || '')
  if (reqOrigin && reqOrigin !== row.redirect_origin) {
    throw createError({ statusCode: 400, statusMessage: 'origin mismatch' })
  }

  const token = decryptSecret(row.token_ciphertext)
  const payload = verifyToken(token)
  if (!payload) throw createError({ statusCode: 500, statusMessage: 'token unavailable' })

  return {
    token,
    user: { id: payload.userId, email: payload.email, display_name: payload.display_name }
  }
})
