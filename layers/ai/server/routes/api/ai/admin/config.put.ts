// PUT /api/ai/admin/config
// Update the deployment's AI model config. Partial: each of enabled_models /
// custom_models / feature_models is written only when present. Values are
// sanitized by the settings' registered `parse` on write, so a malformed body
// can't corrupt the stored shape. Operator-admin only; the config is host-level,
// so the writes go to the deployment-global store with no org context.
import { readBody } from 'h3'
import { requireOperatorAdmin } from '#tenant/server'
import { db } from '#core/server/utils/database'
import { setHostSetting } from '#core/server/utils/settings-store'
import { logUpdate } from '#core/server/utils/activity-logger'
import {
  AI_SETTINGS_NAMESPACE,
  AI_SETTING_ENABLED_MODELS,
  AI_SETTING_CUSTOM_MODELS,
  AI_SETTING_FEATURE_MODELS
} from '#ai/server'

export default defineEventHandler(async (event) => {
  const { userId } = await requireOperatorAdmin(event)
  const body = (await readBody(event)) ?? {}

  await db.transaction().execute(async (tx) => {
    // Custom ids first so a freshly-added id is already "known" when the enabled
    // set is re-read (getEnabledModelIds narrows to catalog ∪ custom).
    if (body.custom_models !== undefined) {
      await setHostSetting(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_CUSTOM_MODELS, body.custom_models)
    }
    if (body.enabled_models !== undefined) {
      await setHostSetting(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_ENABLED_MODELS, body.enabled_models)
    }
    if (body.feature_models !== undefined) {
      await setHostSetting(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_FEATURE_MODELS, body.feature_models)
    }
  })

  logUpdate('core_host_settings', `${AI_SETTINGS_NAMESPACE}:models`, userId, { setting: 'ai-models' })

  return { ok: true }
})
