// The `#ai` client alias — types safe to import in Vue components / composables
// (the admin and org AI pages, the model picker). Server-only helpers live
// behind `#ai/server`.

import type { AiModelInfo } from '#core/ai-fallback/types'

export type { AiModelInfo }

// A host-enabled model as the admin page renders it. `available` is false when
// OpenRouter no longer lists the id (the entry is a placeholder built from the
// stored id alone).
export interface AiEnabledModel extends AiModelInfo {
  available: boolean
}

export interface AiFeatureConfig {
  key: string
  label: string
  description?: string
  // The explicit choice at this scope ('' = unset, fall through).
  model: string
  // What the feature actually resolves to after fallbacks ('' = nothing).
  effectiveModel: string
}

// Full payload of GET /api/ai/admin/config.
export interface AiAdminConfig {
  hostKeyConfigured: boolean
  modelListAvailable: boolean
  enabled: AiEnabledModel[]
  defaultModel: string
  features: AiFeatureConfig[]
}

export type AiOrgKeyStatus = 'none' | 'ok' | 'undecryptable'

// Full payload of GET /api/ai/org/config.
export interface AiOrgConfig {
  key: { status: AiOrgKeyStatus, last4: string }
  hostKeyConfigured: boolean
  usingOwnKey: boolean
  modelListAvailable: boolean
  allowedModels: AiModelInfo[]
  defaultModel: string
  effectiveDefaultModel: string
  features: AiFeatureConfig[]
}
