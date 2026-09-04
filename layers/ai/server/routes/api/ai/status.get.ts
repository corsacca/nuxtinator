// GET /api/ai/status[?feature=<key>]
// Lightweight, auth-gated readiness probe for consumer client UIs (e.g. the
// inbox AI button) to decide whether to surface AI features. Model config is
// host-level, so the answer is the same from every org.
//
//   configured        — an API key is present (live generation possible)
//   hasEnabledModel    — at least one model is enabled
//   featureAvailable   — for the given feature, it resolves to an enabled model
//                        (or, with no feature, that any model is enabled)
import { getQuery } from 'h3'
import { requireAuth } from '#core/server/utils/auth'
import { db } from '#core/server/utils/database'
import { isAiConfigured, getEnabledModelIds, getFeatureModel } from '#ai/server'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const feature = String(getQuery(event).feature ?? '').trim()

  const configured = isAiConfigured()
  const enabled = await getEnabledModelIds(db)
  const hasEnabledModel = enabled.length > 0
  const featureModel = feature ? await getFeatureModel(db, feature) : ''

  return {
    configured,
    hasEnabledModel,
    featureAvailable: configured && (feature ? enabled.includes(featureModel) : hasEnabledModel)
  }
})
