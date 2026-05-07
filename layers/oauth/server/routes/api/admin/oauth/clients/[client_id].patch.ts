// Admin: toggle the enabled flag on a registered OAuth client.
// Disabling a client immediately blocks token issuance and bearer
// validation for that client (see oauth-bearer.ts checks).
//
// Only the `enabled` field is mutable here — DCR client metadata
// (name, redirect URIs, scope) is set at registration time and
// changing it post-hoc would surprise approving users. Re-register
// to change those.

import { db } from '#core/server/utils/database'
import { requireOperatorAdmin } from '#tenant/server'
import { logOauthEvent, OAUTH_EVENTS } from '../../../../../utils/oauth-audit'

interface Body {
  enabled?: unknown
}

export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)

  const clientId = getRouterParam(event, 'client_id')
  if (!clientId || typeof clientId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'client_id is required' })
  }

  const body = await readBody<Body>(event).catch(() => null)
  if (!body || typeof body.enabled !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'enabled (boolean) is required' })
  }

  const existing = await db
    .selectFrom('oauth_clients')
    .select(['client_id', 'client_name', 'enabled'])
    .where('client_id', '=', clientId)
    .executeTakeFirst()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Client not found' })
  }

  if (existing.enabled === body.enabled) {
    // No-op — return current state.
    return { ok: true, client_id: clientId, enabled: existing.enabled }
  }

  await db
    .updateTable('oauth_clients')
    .set({ enabled: body.enabled, updated: new Date() })
    .where('client_id', '=', clientId)
    .execute()

  logOauthEvent({
    event: body.enabled ? OAUTH_EVENTS.CLIENT_ENABLED : OAUTH_EVENTS.CLIENT_DISABLED,
    event3: event,
    metadata: {
      client_id: clientId,
      client_name: existing.client_name
    }
  })

  return { ok: true, client_id: clientId, enabled: body.enabled }
})
