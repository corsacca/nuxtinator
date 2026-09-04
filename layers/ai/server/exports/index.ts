// The `#ai/server` alias surface. Re-exports the OpenRouter client, model
// catalog, host-level model resolution, and the feature registry for consumer
// layers. Mirrors the exact surface of core's `#ai/server` fallback
// (ai-fallback/ai.ts) so consumers see one interface whether or not this layer
// is loaded.
//
// Lives in server/exports/ (not server/utils/) so nitro's auto-import scan
// doesn't double-import these names — the source files ARE auto-imported inside
// this layer, and re-exporting auto-imported names from a scanned file logs
// "Duplicated imports".

export * from '#core/ai-fallback/types'

export { isAiConfigured, complete, generate } from '../utils/ai-client'

export {
  AI_MODEL_CATALOG,
  AI_DEFAULT_MODEL,
  getModelCatalog,
  getCatalogEntry,
  supportsTemperature,
  supportsCaching
} from '../utils/ai-models'

export {
  registerAiFeature,
  getAiFeatures
} from '../utils/ai-feature-registry'

export {
  AI_SETTINGS_NAMESPACE,
  AI_SETTING_ENABLED_MODELS,
  AI_SETTING_CUSTOM_MODELS,
  AI_SETTING_FEATURE_MODELS,
  sanitizeModelIdList,
  sanitizeFeatureModels,
  modelInfo,
  getEnabledModels,
  getEnabledModelIds,
  getFeatureModel
} from '../utils/ai-settings'
