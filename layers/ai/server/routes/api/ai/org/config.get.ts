// GET /api/ai/org/config
// The active org's AI settings page payload: key status (never the key
// itself), whose key generation currently runs on, the models the org may
// pick from, and its default + per-feature choices alongside what each
// resolves to through the org → host chain. Gated by org.settings.write, the
// same permission as the org's other settings tabs.
import { withOrgPermission } from '#tenant/server'
import { getSetting } from '#core/server/utils/settings-store'
import type { Permission } from '#core/app/utils/permissions'
import {
  AI_SETTINGS_NAMESPACE,
  AI_SETTING_DEFAULT_MODEL,
  AI_SETTING_FEATURE_MODELS,
  AI_SETTING_EMBEDDING_MODEL,
  getHostApiKey,
  getModelList,
  getOrgApiKey,
  getAllowedModels,
  getAiFeatures,
  resolveDefaultModel,
  resolveFeatureModel,
  resolveEmbeddingModel,
  getEmbeddingModelList,
  getAiIndexStaleness
} from '#ai/server'

const ORG_SETTINGS_WRITE = 'org.settings.write' as Permission

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, ORG_SETTINGS_WRITE, async (tx) => {
    const list = await getModelList()
    const key = await getOrgApiKey(tx)
    const [allowedModels, defaultModel, featureModels, effectiveDefaultModel] = await Promise.all([
      getAllowedModels(tx),
      getSetting<string>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_DEFAULT_MODEL),
      getSetting<Record<string, string>>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_FEATURE_MODELS),
      resolveDefaultModel(tx)
    ])

    const allFeatures = getAiFeatures()
    const embeddingAvailable = allFeatures.some(f => f.kind === 'embedding')
    const features = await Promise.all(
      allFeatures.filter(f => f.kind !== 'embedding').map(async f => ({
        key: f.key,
        label: f.label,
        description: f.description,
        model: featureModels[f.key] ?? '',
        effectiveModel: await resolveFeatureModel(tx, f.key)
      }))
    )

    const embeddingModels = embeddingAvailable ? await getEmbeddingModelList() : []
    const [embeddingModel, effectiveEmbeddingModel, staleness] = embeddingAvailable
      ? await Promise.all([
          getSetting<string>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_EMBEDDING_MODEL),
          resolveEmbeddingModel(tx),
          getAiIndexStaleness(tx)
        ])
      : ['', '', { model: '', stored: [], stale: false }]

    return {
      key: { status: key.status, last4: key.last4 },
      hostKeyConfigured: !!getHostApiKey(),
      usingOwnKey: key.status === 'ok',
      modelListAvailable: list.length > 0,
      allowedModels,
      defaultModel,
      effectiveDefaultModel,
      features,
      embeddingAvailable,
      embeddingModels,
      embeddingModel,
      effectiveEmbeddingModel,
      embeddingStale: staleness.stale,
      embeddingStoredModels: staleness.stored
    }
  })
})
