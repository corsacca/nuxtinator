// Provider routing for stored model ids. OpenRouter ids are its own
// `vendor/model` slugs; Tinfoil ids are stored as `tinfoil/<modelName>` so the
// two catalogs can share one id space. Pure — unit-tested without Nuxt.
import type { AiProvider, AiReasoningLevel, AiReasoningSpec } from '../../types/ai-ext'

export const TINFOIL_MODEL_PREFIX = 'tinfoil/'

export function providerOf(modelId: string): AiProvider {
  return modelId.startsWith(TINFOIL_MODEL_PREFIX) ? 'tinfoil' : 'openrouter'
}

// The model name the provider's API expects.
export function wireModelId(modelId: string): string {
  return providerOf(modelId) === 'tinfoil' ? modelId.slice(TINFOIL_MODEL_PREFIX.length) : modelId
}

function substituteEffort(value: unknown, effort: string): unknown {
  if (value === '$EFFORT') return effort
  if (Array.isArray(value)) return value.map(v => substituteEffort(v, effort))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substituteEffort(v, effort)]))
  }
  return value
}

// Request-body fields for a reasoning level on a model with `spec`. Empty when
// the model has no spec, no level was asked for, or the model can't honour it
// (e.g. 'off' on a model that always reasons).
export function reasoningParams(
  spec: AiReasoningSpec | null | undefined,
  level: AiReasoningLevel | undefined
): Record<string, unknown> {
  if (!spec || !level) return {}
  if (level === 'off') return spec.disable ? structuredClone(spec.disable) : {}
  if (!spec.enable) return {}
  const effort = spec.effortMap[level] ?? level
  return substituteEffort(spec.enable, effort) as Record<string, unknown>
}
