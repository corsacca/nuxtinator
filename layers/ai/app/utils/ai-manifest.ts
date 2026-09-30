// The `#ai` client alias — types safe to import in Vue components / composables
// (the admin and org AI pages, the model picker). Server-only helpers live
// behind `#ai/server`.

import type { AiModelInfo, AiEmbeddingModelInfo } from '#core/ai-fallback/types'

export type { AiModelInfo, AiEmbeddingModelInfo }

// An org (or the single-tenant scope, orgId null) whose vector indexes were
// built with a model other than the one that resolves for it now.
export interface AiStaleScope {
  orgId: string | null
  model: string
  stored: string[]
}

export interface AiReindexScopeStatus {
  orgId: string | null
  state: 'pending' | 'running' | 'done' | 'error'
  chunks: number
  error?: string
}

export interface AiReindexStatus {
  running: boolean
  startedAt: string | null
  finishedAt: string | null
  scopes: AiReindexScopeStatus[]
}

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
  // Embedding section: shown when a loaded layer registered an embedding feature.
  embeddingAvailable: boolean
  embeddingModelListAvailable: boolean
  embeddingModel: string
  staleScopes: AiStaleScope[]
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
  embeddingAvailable: boolean
  embeddingModels: AiEmbeddingModelInfo[]
  embeddingModel: string
  effectiveEmbeddingModel: string
  embeddingStale: boolean
  embeddingStoredModels: string[]
}
