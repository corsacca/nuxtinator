// The `#ai/server` alias surface. Re-exports the OpenRouter client, the live
// model list, org/host model + key resolution, and the feature registry for
// consumer layers. Mirrors the exact surface of core's `#ai/server` fallback
// (ai-fallback/ai.ts) so consumers see one interface whether or not this layer
// is loaded.
//
// Lives in server/exports/ (not server/utils/) so nitro's auto-import scan
// doesn't double-import these names — the source files ARE auto-imported inside
// this layer, and re-exporting auto-imported names from a scanned file logs
// "Duplicated imports".

export * from '#core/ai-fallback/types'
export * from '#core/ai-fallback/vectors'
export * from '#core/ai-fallback/chunk'

export {
  isAiConfigured,
  resolveAiRun,
  resolveAiEmbedRun,
  complete,
  generate,
  validateApiKey,
  isEmbeddingConfigured,
  embed,
  probeEmbeddingModel
} from '../utils/ai-client'
export type { AiKeyCheck } from '../utils/ai-client'

export {
  getEmbeddingModelList,
  getEmbeddingModelInfo,
  isKnownEmbeddingModel
} from '../utils/ai-embedding-model-list'

export {
  registerAiReindexer,
  getAiReindexers,
  getAiIndexStaleness,
  listStaleAiScopes,
  listAiOrgScopes,
  withAiScopeTx,
  startAiReindex,
  getAiReindexStatus
} from '../utils/ai-reindex-registry'
export type { AiIndexStaleness, AiReindexStatus, AiReindexScopeStatus } from '../utils/ai-reindex-registry'

export { getHostApiKey } from '../utils/ai-config'

export {
  getModelList,
  getModelInfo,
  isKnownModel,
  supportsTemperature,
  supportsCaching
} from '../utils/ai-model-list'

export {
  registerAiFeature,
  getAiFeatures
} from '../utils/ai-feature-registry'

export {
  AI_SETTINGS_NAMESPACE,
  AI_SETTING_ENABLED_MODELS,
  AI_SETTING_DEFAULT_MODEL,
  AI_SETTING_FEATURE_MODELS,
  AI_SETTING_API_KEY,
  AI_SETTING_EMBEDDING_MODEL,
  sanitizeModelIdList,
  sanitizeModelId,
  sanitizeFeatureModels,
  getOrgApiKey,
  setOrgApiKey,
  hasOrgApiKey,
  getEffectiveApiKey,
  modelInfoOrPlaceholder,
  getHostEnabledModelIds,
  getAllowedModelIds,
  getAllowedModels,
  resolveDefaultModel,
  resolveFeatureModel,
  resolveEmbeddingModel
} from '../utils/ai-settings'
export type { AiOrgKey, AiOrgKeyStatus } from '../utils/ai-settings'
