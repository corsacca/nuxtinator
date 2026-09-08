// PUT /api/ai/admin/config
// Update the host's AI config. Partial: each of enabled_models / default_model
// / feature_models is written only when present. The enabled set is narrowed
// to models OpenRouter lists; the default and every feature choice must be ''
// (unset) or a member of the enabled set as it stands after this write.
// Operator-admin only; writes go to the deployment-global store with no org
// context.
import { readBody } from 'h3'
import { requireOperatorAdmin } from '#tenant/server'
import { db } from '#core/server/utils/database'
import { getHostSetting, setHostSetting } from '#core/server/utils/settings-store'
import { logUpdate } from '#core/server/utils/activity-logger'
import {
  AI_SETTINGS_NAMESPACE,
  AI_SETTING_ENABLED_MODELS,
  AI_SETTING_DEFAULT_MODEL,
  AI_SETTING_FEATURE_MODELS,
  getModelList,
  isKnownModel,
  sanitizeModelIdList,
  sanitizeModelId,
  sanitizeFeatureModels
} from '#ai/server'

export default defineEventHandler(async (event) => {
  const { userId } = await requireOperatorAdmin(event)
  const body = (await readBody(event)) ?? {}

  await getModelList()

  await db.transaction().execute(async (tx) => {
    if (body.enabled_models !== undefined) {
      const enabled = sanitizeModelIdList(body.enabled_models).filter(isKnownModel)
      await setHostSetting(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_ENABLED_MODELS, enabled)
    }

    const enabledSet = new Set(await getHostSetting<string[]>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_ENABLED_MODELS))

    if (body.default_model !== undefined) {
      const id = sanitizeModelId(body.default_model)
      if (id && !enabledSet.has(id)) {
        throw createError({ statusCode: 400, statusMessage: 'The default model must be one of the enabled models.' })
      }
      await setHostSetting(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_DEFAULT_MODEL, id)
    }

    if (body.feature_models !== undefined) {
      const map = sanitizeFeatureModels(body.feature_models)
      for (const [feature, id] of Object.entries(map)) {
        if (!enabledSet.has(id)) {
          throw createError({ statusCode: 400, statusMessage: `The model for "${feature}" must be one of the enabled models.` })
        }
      }
      await setHostSetting(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_FEATURE_MODELS, map)
    }
  })

  logUpdate('core_host_settings', `${AI_SETTINGS_NAMESPACE}:models`, userId, { setting: 'ai-models' })

  return { ok: true }
})
