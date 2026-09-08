// PUT /api/ai/org/key
// Set (or replace) the active org's own OpenRouter key. The key is verified
// against OpenRouter first — a rejected key is a 400 and nothing is stored —
// then encrypted at rest. The response and the audit row carry only the last
// four characters. Gated by org.settings.write.
import { readBody } from 'h3'
import { withOrgPermission } from '#tenant/server'
import { logEvent } from '#core/server/utils/activity-logger'
import type { Permission } from '#core/app/utils/permissions'
import { AI_SETTINGS_NAMESPACE, validateApiKey, setOrgApiKey } from '#ai/server'

const ORG_SETTINGS_WRITE = 'org.settings.write' as Permission

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) ?? {}
  const key = typeof body.key === 'string' ? body.key.trim() : ''
  if (!key) {
    throw createError({ statusCode: 400, statusMessage: 'Enter an API key.' })
  }
  if (key.length > 512) {
    throw createError({ statusCode: 400, statusMessage: 'That does not look like an OpenRouter key.' })
  }

  return await withOrgPermission(event, ORG_SETTINGS_WRITE, async (tx, ctx) => {
    const check = await validateApiKey(key)
    if (!check.ok) {
      throw createError({ statusCode: 400, statusMessage: check.message })
    }

    await setOrgApiKey(tx, key)
    const last4 = key.slice(-4)

    await logEvent({
      eventType: 'ai_org_key_set',
      tableName: 'core_settings',
      recordId: `${AI_SETTINGS_NAMESPACE}:api_key`,
      userId: ctx.userId,
      metadata: { last4, label: check.label }
    }, tx)

    return { ok: true, last4, label: check.label }
  })
})
