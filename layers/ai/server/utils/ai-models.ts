import type { AiModelCatalogEntry } from '#core/ai-fallback/types'

// Code-owned model catalog. Ids are OpenRouter model slugs. Per the
// persisted-state pattern this catalog (and each entry's default-enabled flag)
// is the source of truth for *what models exist*; the DB (`core_settings`
// namespace `ai`) stores only the admin's explicit enable/disable, any custom
// model ids they add, and the per-feature model choices. Adding a model or
// changing a default is a code edit here — never a migration or data backfill.
//
// `supportsTemperature`/`supportsCaching` reflect provider quirks: some newer
// models reject sampling params (400), and only Anthropic models honour prompt
// caching via `cache_control`. The client reads these to decide whether to send
// `temperature` and whether cache breakpoints do anything.
export const AI_MODEL_CATALOG: AiModelCatalogEntry[] = [
  {
    id: 'anthropic/claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    supportsTemperature: true,
    supportsCaching: true,
    defaultEnabled: true
  },
  {
    id: 'anthropic/claude-3.5-haiku',
    label: 'Claude Haiku 3.5',
    supportsTemperature: true,
    supportsCaching: true,
    defaultEnabled: true
  },
  {
    id: 'openai/gpt-4.1',
    label: 'GPT-4.1',
    supportsTemperature: true,
    supportsCaching: false,
    defaultEnabled: false
  },
  {
    id: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    supportsTemperature: true,
    supportsCaching: false,
    defaultEnabled: false
  }
]

// Fallback model for any feature with no explicit per-feature choice (as long as
// it's in the enabled set — see ai-settings.getFeatureModel).
export const AI_DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5'

export function getModelCatalog(): AiModelCatalogEntry[] {
  return AI_MODEL_CATALOG
}

export function getCatalogEntry(id: string): AiModelCatalogEntry | undefined {
  return AI_MODEL_CATALOG.find(m => m.id === id)
}

// Whether to send sampling params (temperature) for a model. Catalog entries
// declare it; unknown/custom ids default to false — safer, since a model that
// rejects sampling params returns a hard error the caller can't recover from,
// whereas losing determinism on an unknown model is harmless.
export function supportsTemperature(modelId: string): boolean {
  return getCatalogEntry(modelId)?.supportsTemperature ?? false
}

// Whether the model honours Anthropic prompt caching. Custom ids default to
// false (cache breakpoints become no-ops). The grounding prefix is kept
// byte-stable regardless so a caching-capable model still hits.
export function supportsCaching(modelId: string): boolean {
  return getCatalogEntry(modelId)?.supportsCaching ?? false
}
