// Default `#ai/server` implementation when the `@nuxtinator/ai` layer is not
// loaded. `isAiConfigured()` reports false so consumers gate their AI features
// off and never reach the throwing calls; anything that does generate throws
// helpfully. Mirrors email-fallback/email.ts.
//
// Lives outside `server/utils/` so Nuxt's auto-imports don't double up on it.
// The `modules/ai-kernel.ts` Nuxt module wires it as the `#ai/server` alias only
// when no AI layer has set the alias first.

import { createError } from 'h3'
import type {
  AiCompleteOptions,
  AiCompleteResult,
  AiDbClient,
  AiFeature,
  AiGenerateOptions,
  AiGenerateResult,
  AiModelCatalogEntry,
  AiModelInfo
} from './types'

// Re-export the shared types so `#ai/server` carries them whether the real
// layer or this fallback is active.
export * from './types'

function notConfigured(): never {
  throw createError({
    statusCode: 503,
    statusMessage:
      'No AI backend is configured. Add the @nuxtinator/ai layer to extends: and set OPENROUTER_API_KEY.'
  })
}

export function isAiConfigured(): boolean {
  return false
}

export async function complete(_opts: AiCompleteOptions): Promise<AiCompleteResult> {
  notConfigured()
}

export async function generate<T = Record<string, unknown>>(
  _opts: AiGenerateOptions
): Promise<AiGenerateResult<T>> {
  notConfigured()
}

// Feature registration is a no-op with no AI layer: consumers still call it at
// boot, but nothing surfaces a model selector because the admin AI page lives in
// the AI layer.
export function registerAiFeature(_feature: AiFeature): void {}

export function getAiFeatures(): AiFeature[] {
  return []
}

export function getModelCatalog(): AiModelCatalogEntry[] {
  return []
}

export async function getEnabledModels(_tx: AiDbClient): Promise<AiModelInfo[]> {
  return []
}

export async function getEnabledModelIds(_tx: AiDbClient): Promise<string[]> {
  return []
}

// No configured model. Consumers must check `isAiConfigured()` before using the
// result — the empty string is never a valid model id.
export async function getFeatureModel(_tx: AiDbClient, _feature: string): Promise<string> {
  return ''
}

export function supportsTemperature(_modelId: string): boolean {
  return false
}

export function supportsCaching(_modelId: string): boolean {
  return false
}
