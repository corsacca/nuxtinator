/**
 * POST /api/v1/feedback/authorize — first leg of the widget sign-in flow.
 *
 * Called SAME-ORIGIN from the host's /feedback/connect page (so the host
 * `auth-token` cookie identifies the user; SameSite=lax blocks cross-site POSTs
 * from carrying it). Validates the project + redirect origin against the
 * project's allowlist, mints a long-lived access token, and stashes it
 * encrypted behind a single-use, short-lived authorization code. Returns the
 * code; the connect page redirects it to the embedding site, which exchanges it
 * at /api/v1/feedback/token.
 *
 * 401 here is the connect page's signal to send the user through login first.
 */
import { readBody } from 'h3'
import { withProjectOrgContext } from '#tenant/server'
import { signScopedToken } from '#core/server/utils/auth'
import { encryptSecret } from '#core/server/utils/secret-crypto'
import { db } from '#core/server/utils/database'
import { requireWidgetAuthUser, WIDGET_TOKEN_SCOPE } from '../../../../utils/widget-auth'
import { enforceWidgetRateLimit, widgetClientIp } from '../../../../utils/rate-limit'
import { widgetSha256Hex, randomUrlToken, isValidWidgetChallenge } from '../../../../utils/widget-crypto'
import { originOf, isRedirectOriginAllowed } from '../../../../utils/widget-origins'

const CODE_TTL_MS = 60_000

export default defineEventHandler(async (event) => {
  await enforceWidgetRateLimit(event, 'ratelimit.feedback.authorize', 'ip', widgetClientIp(event), 30, 60_000)

  const authUser = requireWidgetAuthUser(event)

  const body = await readBody(event) ?? {}
  const projectId = typeof body.project_id === 'string' ? body.project_id : ''
  const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri : ''
  const codeChallenge = typeof body.code_challenge === 'string' ? body.code_challenge : ''

  if (!projectId) throw createError({ statusCode: 400, statusMessage: 'project_id required' })

  const redirectOrigin = originOf(redirectUri)
  if (!redirectOrigin) throw createError({ statusCode: 400, statusMessage: 'invalid redirect_uri' })

  if (!isValidWidgetChallenge(codeChallenge)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid code_challenge' })
  }

  // Read the project under org context (RLS) to confirm it exists and load its
  // origin allowlist. Public — no org-membership requirement, matching
  // /api/v1/project/:id.
  const project = await withProjectOrgContext(event, projectId, async (tx) => {
    return await tx
      .selectFrom('projects')
      .select(['id', 'allowed_origins'])
      .where('id', '=', projectId)
      .executeTakeFirst()
  })

  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  if (!isRedirectOriginAllowed(redirectOrigin, project.allowed_origins ?? [])) {
    throw createError({ statusCode: 403, statusMessage: 'redirect origin not allowed for this project' })
  }

  const token = signScopedToken(
    { userId: authUser.userId, email: authUser.email, display_name: authUser.display_name },
    WIDGET_TOKEN_SCOPE,
    (useRuntimeConfig().feedbackTokenTtl as string) || '30d'
  )

  const code = randomUrlToken(32)
  await db
    .insertInto('feedback_auth_codes')
    .values({
      code_hash: widgetSha256Hex(code),
      user_id: authUser.userId,
      project_id: projectId,
      redirect_origin: redirectOrigin,
      code_challenge: codeChallenge,
      token_ciphertext: encryptSecret(token),
      expires: new Date(Date.now() + CODE_TTL_MS)
    })
    .execute()

  return { code }
})
