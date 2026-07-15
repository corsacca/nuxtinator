// GET /api/ai/status[?feature=<key>]
// Lightweight, auth-gated readiness probe for consumer client UIs (e.g. the
// inbox AI button) to decide whether to surface AI features. Runs in the org tx
// so the enabled set / feature resolution reflect the active org.
//
//   configured        — an API key is present (live generation possible)
//   hasEnabledModel    — the org has at least one model enabled
//   featureAvailable   — for the given feature, it resolves to an enabled model
//                        (or, with no feature, that any model is enabled)
import { getQuery } from 'h3'
import { withOrgContext } from '#tenant/server'
import { isAiConfigured, getEnabledModelIds, getFeatureModel } from '#ai/server'

export default defineEventHandler(async (event) => {
  const feature = String(getQuery(event).feature ?? '').trim()

  return withOrgContext(event, async (tx) => {
    const configured = isAiConfigured()
    const enabled = await getEnabledModelIds(tx)
    const hasEnabledModel = enabled.length > 0
    const featureModel = feature ? await getFeatureModel(tx, feature) : ''

    return {
      configured,
      hasEnabledModel,
      featureAvailable: configured && (feature ? enabled.includes(featureModel) : hasEnabledModel)
    }
  })
})
