// GET /api/ai/admin/config
// Operator-admin view of the host's AI config: the enabled set (with each
// model's live info, or a placeholder when its provider no longer lists it), the
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
  AI_SETTING_EMBEDDING_MODEL,
  getHostApiKey,
  isTinfoilConfigured,
  getAllModels,
  isKnownModel,
  modelInfoOrPlaceholder,
  getAiFeatures,
  resolveFeatureModel,
  getEmbeddingModelList,
  listStaleAiScopes
} from '#ai/server'

export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)

  const list = await getAllModels()
  const embeddingList = await getEmbeddingModelList()
  const [enabledIds, defaultModel, featureModels, embeddingModel] = await Promise.all([
    getHostSetting<string[]>(db, AI_SETTINGS_NAMESPACE, AI_SETTING_ENABLED_MODELS),
    getHostSetting<string>(db, AI_SETTINGS_NAMESPACE, AI_SETTING_DEFAULT_MODEL),
    getHostSetting<Record<string, string>>(db, AI_SETTINGS_NAMESPACE, AI_SETTING_FEATURE_MODELS),
    getHostSetting<string>(db, AI_SETTINGS_NAMESPACE, AI_SETTING_EMBEDDING_MODEL)
  ])

  const enabled = enabledIds.map(id => ({
    ...modelInfoOrPlaceholder(id),
    available: list.length > 0 && isKnownModel(id)
  }))

  // Embedding features have no chat model; they only switch the embedding
  // section on.
  const allFeatures = getAiFeatures()
  const embeddingAvailable = allFeatures.some(f => f.kind === 'embedding')
  const features = await Promise.all(
    allFeatures.filter(f => f.kind !== 'embedding').map(async f => ({
      key: f.key,
      label: f.label,
      description: f.description,
      kind: f.kind ?? 'chat',
      model: featureModels[f.key] ?? '',
      effectiveModel: await resolveFeatureModel(db, f.key)
    }))
  )

  // Orgs whose indexes were built with a model other than the one resolving
  // for them now — the host page offers to rebuild these.
  const staleScopes = embeddingAvailable
    ? (await listStaleAiScopes()).map(s => ({ orgId: s.orgId, model: s.staleness.model, stored: s.staleness.stored }))
    : []

  return {
    hostKeyConfigured: !!getHostApiKey(),
    tinfoilConfigured: isTinfoilConfigured(),
    modelListAvailable: list.length > 0,
    enabled,
    defaultModel,
    features,
    embeddingAvailable,
    embeddingModelListAvailable: embeddingList.length > 0,
    embeddingModel,
    staleScopes
  }
})
