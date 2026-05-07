import type { H3Event } from 'h3'
import { db } from '#core/server/utils/database'
import { getAuthUser } from '#core/server/utils/auth'
import { runInOrgTransaction } from '#tenant/server'
import { PERMISSION_META } from '#core/app/utils/permissions'
import { getOauthConfig } from './oauth-config'
import { verifyCookiePayload } from './oauth-crypto'
import { parseScopeString, OFFLINE_ACCESS_SCOPE } from './oauth-validation'

export interface ConsentViewModel {
  status: 'ok' | 'not_found' | 'wrong_user' | 'consumed' | 'expired' | 'missing_csrf' | 'unauthorized'
  requestId?: string
  clientName?: string
  clientDynamic?: boolean
  scopeItems?: { scope: string, description: string }[]
  csrfToken?: string
}

function describeScope(scope: string): string {
  if (scope === OFFLINE_ACCESS_SCOPE) {
    return 'Maintain access when you are not actively using the client (refresh tokens)'
  }
  const meta = PERMISSION_META[scope]
  return meta?.description || scope
}

export async function loadConsentView(event: H3Event, requestId: string): Promise<ConsentViewModel> {
  const authUser = getAuthUser(event)
  if (!authUser) return { status: 'unauthorized' }

  // RLS-scoped in multi mode (oauth_pending_requests has org_id + policy).
  // Single mode: plain transaction.
  const pending = await runInOrgTransaction(event, async (tx) => {
    return await tx
      .selectFrom('oauth_pending_requests')
      .selectAll()
      .where('id', '=', requestId)
      .executeTakeFirst()
  })

  if (!pending) return { status: 'not_found' }
  if (pending.user_id !== authUser.userId) return { status: 'not_found' }
  if (pending.consumed) return { status: 'consumed' }
  if (new Date(pending.expires) < new Date()) return { status: 'expired' }

  const cfg = getOauthConfig()
  const cookieName = `oauth_consent_token_${requestId}`
  const signed = getCookie(event, cookieName)
  if (!signed) return { status: 'missing_csrf' }
  const payload = verifyCookiePayload<{ rid: string, csrf: string, exp: number }>(signed, cfg.consentCookieSecret)
  if (!payload || payload.rid !== requestId) return { status: 'missing_csrf' }
  if (payload.exp < Date.now()) return { status: 'missing_csrf' }

  const client = await db
    .selectFrom('oauth_clients')
    .select(['client_name', 'dynamic'])
    .where('client_id', '=', pending.client_id)
    .executeTakeFirst()

  const scopes = parseScopeString(pending.scope)
  const scopeItems = scopes.map(scope => ({
    scope,
    description: describeScope(scope)
  }))

  return {
    status: 'ok',
    requestId,
    clientName: client?.client_name || pending.client_id,
    clientDynamic: Boolean(client?.dynamic),
    scopeItems,
    csrfToken: payload.csrf
  }
}
