// GET /api/ai/admin/config
// Operator-admin view of the host's AI config: the enabled set (with each
// model's live info, or a placeholder when OpenRouter no longer lists it), the
// host default model, and each registered feature with the host's choice and
// what it resolves to. Gated by requireOperatorAdmin (model enablement spends
// the host key). Reads the deployment-global store with no org context — the
// /admin/ai page lives under the org-less /admin area and never sends one, so
// the resolved values here are the host chain only.
import { requireOperatorAdmin } from '#tenant/server'
import { db } from '#core/server/utils/database'
import { getHostSetting } from '#core/server/utils/settings-store'
import {
  AI_SETTINGS_NAMESPACE,
  AI_SETTING_ENABLED_MODELS,
  AI_SETTING_DEFAULT_MODEL,
  AI_SETTING_FEATURE_MODELS,
  getHostApiKey,
  getModelList,
  isKnownModel,
  modelInfoOrPlaceholder,
  getAiFeatures,
  resolveFeatureModel
} from '#ai/server'

export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)

  const list = await getModelList()
  const [enabledIds, defaultModel, featureModels] = await Promise.all([
    getHostSetting<string[]>(db, AI_SETTINGS_NAMESPACE, AI_SETTING_ENABLED_MODELS),
    getHostSetting<string>(db, AI_SETTINGS_NAMESPACE, AI_SETTING_DEFAULT_MODEL),
    getHostSetting<Record<string, string>>(db, AI_SETTINGS_NAMESPACE, AI_SETTING_FEATURE_MODELS)
  ])

  const enabled = enabledIds.map(id => ({
    ...modelInfoOrPlaceholder(id),
    available: list.length > 0 && isKnownModel(id)
  }))

  const features = await Promise.all(
    getAiFeatures().map(async f => ({
      key: f.key,
      label: f.label,
      description: f.description,
      model: featureModels[f.key] ?? '',
      effectiveModel: await resolveFeatureModel(db, f.key)
    }))
  )

  return {
    hostKeyConfigured: !!getHostApiKey(),
    modelListAvailable: list.length > 0,
    enabled,
    defaultModel,
    features
  }
})
