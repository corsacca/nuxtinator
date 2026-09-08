// DELETE /api/ai/org/key
// Remove the active org's own OpenRouter key. Generation falls back to the
// host's key (if any) and the org's model choices are re-validated against
// the host-enabled set on the next read. Gated by org.settings.write.
import { withOrgPermission } from '#tenant/server'
import { logEvent } from '#core/server/utils/activity-logger'
import type { Permission } from '#core/app/utils/permissions'
import { AI_SETTINGS_NAMESPACE, setOrgApiKey } from '#ai/server'

const ORG_SETTINGS_WRITE = 'org.settings.write' as Permission

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, ORG_SETTINGS_WRITE, async (tx, ctx) => {
    await setOrgApiKey(tx, '')

    await logEvent({
      eventType: 'ai_org_key_removed',
      tableName: 'core_settings',
      recordId: `${AI_SETTINGS_NAMESPACE}:api_key`,
      userId: ctx.userId
    }, tx)

    return { ok: true }
  })
})
