import { getHostSetting } from '#core/server/utils/settings-store'
import type { AiDbClient, AiModelInfo } from '#core/ai-fallback/types'
import { AI_MODEL_CATALOG, AI_DEFAULT_MODEL, getCatalogEntry } from './ai-models'

// The DB-backed half of the AI layer's model config. Everything here is an
// override on top of the code-owned catalog (ai-models.ts): reads merge the
// registered defaults with the `core_host_settings` (namespace `ai`) overrides,
// so adding a model or changing a default is never a migration. The config is
// host-level — one enabled set for the whole deployment in both single- and
// multi-tenant mode, because every model spends the deployment's shared API
// key. Callers pass any db client; a request `tx` inside an org transaction
// reads the same rows.

export const AI_SETTINGS_NAMESPACE = 'ai'

// Admin's explicit enabled-model set: a list of model ids that overrides the
// catalog's `defaultEnabled` flags. Its registered default is the list of
// default-enabled catalog ids (see register-ai.ts).
export const AI_SETTING_ENABLED_MODELS = 'enabled_models'

// Admin-added OpenRouter model ids beyond the code catalog (free-text, so a
// newly released model is adoptable without a code change). Stored explicitly.
export const AI_SETTING_CUSTOM_MODELS = 'custom_models'

// Per-feature model choices as one `{ [featureKey]: modelId }` map. One
// registered setting (rather than a key per feature) because feature keys are
// defined by consumer layers and can't all be pre-registered.
export const AI_SETTING_FEATURE_MODELS = 'feature_models'

// Turn a raw (possibly bad) stored value into a clean string[] of ids.
export function sanitizeModelIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of value) {
    if (typeof v !== 'string') continue
    const id = v.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

// Turn a raw stored value into a clean `{ featureKey: modelId }` map.
export function sanitizeFeatureModels(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k === 'string' && k.length > 0 && typeof v === 'string' && v.trim().length > 0) {
      out[k] = v.trim()
    }
  }
  return out
}

// Build the display info for a model id: catalog metadata when known, otherwise
// treat it as an admin-added custom id with unknown (assumed-off) capabilities.
export function modelInfo(id: string): AiModelInfo {
  const entry = getCatalogEntry(id)
  if (entry) {
    return {
      id: entry.id,
      label: entry.label,
      supportsTemperature: entry.supportsTemperature,
      supportsCaching: entry.supportsCaching,
      custom: false
    }
  }
  return { id, label: id, supportsTemperature: false, supportsCaching: false, custom: true }
}

// The ids the deployment has enabled: the stored enabled set, narrowed to models that
// actually exist (catalog entry or a registered custom id) so a removed model
// can't linger as enabled.
export async function getEnabledModelIds(tx: AiDbClient): Promise<string[]> {
  const [enabled, custom] = await Promise.all([
    getHostSetting<string[]>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_ENABLED_MODELS),
    getHostSetting<string[]>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_CUSTOM_MODELS)
  ])
  const known = new Set<string>([...AI_MODEL_CATALOG.map(m => m.id), ...sanitizeModelIdList(custom)])
  return sanitizeModelIdList(enabled).filter(id => known.has(id))
}

// The enabled models as display info (catalog + custom), for feature selectors.
export async function getEnabledModels(tx: AiDbClient): Promise<AiModelInfo[]> {
  const ids = await getEnabledModelIds(tx)
  return ids.map(modelInfo)
}

// Resolve the model for a feature: the admin's per-feature choice if it's still
// enabled, else the default model if enabled, else the first enabled model. The
// caller must have checked `isAiConfigured()` first — with nothing enabled this
// returns AI_DEFAULT_MODEL as a last resort so a request never runs model-less.
export async function getFeatureModel(tx: AiDbClient, feature: string): Promise<string> {
  const [featureModels, enabled] = await Promise.all([
    getHostSetting<Record<string, string>>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_FEATURE_MODELS),
    getEnabledModelIds(tx)
  ])
  const chosen = sanitizeFeatureModels(featureModels)[feature]
  if (chosen && enabled.includes(chosen)) return chosen
  if (enabled.includes(AI_DEFAULT_MODEL)) return AI_DEFAULT_MODEL
  return enabled[0] ?? AI_DEFAULT_MODEL
}
