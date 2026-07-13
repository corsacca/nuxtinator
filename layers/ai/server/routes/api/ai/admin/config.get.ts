// GET /api/ai/admin/config
// Operator-admin view of AI model config for the active org: the full model
// list (catalog + admin-added custom ids) with enabled state, and each
// registered feature with its resolved model. Gated by requireOperatorAdmin
// (model enablement spends the shared API budget); read in the org tx so the
// enabled set / feature choices are the active org's.
import { requireOperatorAdmin, withOrgContext } from '#tenant/server'
import { getSetting } from '#core/server/utils/settings-store'
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

  return withOrgContext(event, async (tx) => {
    const [enabledIds, custom] = await Promise.all([
      getEnabledModelIds(tx),
      getSetting<string[]>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_CUSTOM_MODELS)
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
        model: await getFeatureModel(tx, f.key)
      }))
    )

    return { configured: isAiConfigured(), models, features }
  })
})
