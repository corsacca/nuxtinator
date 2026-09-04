// GET /api/ai/admin/config
// Operator-admin view of the deployment's AI model config: the full model list
// (catalog + admin-added custom ids) with enabled state, and each registered
// feature with its resolved model. Gated by requireOperatorAdmin (model
// enablement spends the shared API budget). The config is host-level, so this
// reads the deployment-global store with no org context — the /admin/ai page
// lives under the org-less /admin area and never sends one.
import { requireOperatorAdmin } from '#tenant/server'
import { db } from '#core/server/utils/database'
import { getHostSetting } from '#core/server/utils/settings-store'
import {
  AI_MODEL_CATALOG,
  AI_SETTINGS_NAMESPACE,
  AI_SETTING_CUSTOM_MODELS,
  isAiConfigured,
  getAiFeatures,
  getEnabledModelIds,
  getFeatureModel,
  modelInfo
} from '#ai/server'

export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)

  const [enabledIds, custom] = await Promise.all([
    getEnabledModelIds(db),
    getHostSetting<string[]>(db, AI_SETTINGS_NAMESPACE, AI_SETTING_CUSTOM_MODELS)
  ])
  const enabledSet = new Set(enabledIds)
  const catalogIds = new Set(AI_MODEL_CATALOG.map(m => m.id))

  // Catalog models first, then any custom ids not shadowing a catalog entry.
  const ids = [
    ...AI_MODEL_CATALOG.map(m => m.id),
    ...custom.filter(id => !catalogIds.has(id))
  ]
  const models = ids.map(id => ({ ...modelInfo(id), enabled: enabledSet.has(id) }))

  const features = await Promise.all(
    getAiFeatures().map(async f => ({
      key: f.key,
      label: f.label,
      description: f.description,
      model: await getFeatureModel(db, f.key)
    }))
  )

  return { configured: isAiConfigured(), models, features }
})
