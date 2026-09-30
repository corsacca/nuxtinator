// Shared type surface for the `#ai/server` alias. Canonical here in core so the
// throwing fallback (ai-fallback/ai.ts) and the real `@nuxtinator/ai`
// implementation expose one identical, drift-proof interface — the same reason
// `#core/server/utils/email-templates` owns the email option types both the
// fallback and the mailgun backend build against.
//
// Pure types only (no runtime exports), and deliberately outside `server/utils/`
// so Nuxt's auto-import scan ignores it while `#core/ai-fallback/types` stays
// importable from the AI layer.

import type { Kysely, Transaction } from 'kysely'
import type { Database } from '../server/database/schema'

export type AiDbClient = Kysely<Database> | Transaction<Database>

// One slice of prompt content. Splitting content into parts lets a large,
// byte-stable prefix be marked cacheable: OpenRouter forwards Anthropic
// `cache_control` to caching-capable models and silently ignores it elsewhere,
// so `cache: true` is a no-op on models that don't support prompt caching.
export interface AiTextPart {
  type: 'text'
  text: string
  // Mark this part (and everything before it) as a prompt-cache breakpoint on
  // caching-capable models. No-op elsewhere.
  cache?: boolean
}

export type AiContent = string | AiTextPart[]

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: AiContent
}

// A single tool the model may — or, for `generate`, must — call. `parameters`
// is a JSON Schema object describing the tool's arguments (the structured
// output).
export interface AiTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

// Resolves one tool call the model made during `complete`. The returned string
// is fed back to the model as the tool result.
export type AiToolHandler = (name: string, input: Record<string, unknown>) => Promise<string> | string

export interface AiToolCallRecord {
  name: string
  input: Record<string, unknown>
}

export interface AiCompleteOptions {
  // The caller's transaction. Generation runs on behalf of whichever org the
  // transaction is scoped to: the org's own API key and model choices are read
  // through it, falling back to the host's key and choices when the org has
  // none. Required so no call path can spend the host key by omission.
  tx: AiDbClient
  // The registered feature key (see `registerAiFeature`), which resolves to
  // the model an admin picked for it.
  feature: string
  system?: AiContent
  messages: AiMessage[]
  maxTokens?: number
  temperature?: number
  // Tools the model may call. Each call is resolved through `onToolCall` and
  // its result appended to the conversation before the model is asked again.
  // After `maxToolRounds` rounds (default 4) one final call runs without tools
  // so the model must answer in text.
  tools?: AiTool[]
  onToolCall?: AiToolHandler
  maxToolRounds?: number
  // Streaming. With `onTextDelta` the provider call streams and reply text
  // arrives in fragments as the model writes it. Text from a round that ends
  // in tool calls is not part of the reply; `onTextDiscard` fires so a consumer
  // can drop what it already showed.
  onTextDelta?: (delta: string) => void
  onTextDiscard?: () => void
}

export interface AiCompleteResult {
  text: string
  model: string
  finishReason: string
  // Tool calls resolved while producing this answer, in order.
  toolCalls: AiToolCallRecord[]
}

export interface AiGenerateOptions {
  tx: AiDbClient
  feature: string
  system?: AiContent
  messages: AiMessage[]
  // The one tool the model is forced to call; its parsed arguments are returned
  // as the structured `input`.
  tool: AiTool
  maxTokens?: number
  temperature?: number
}

export interface AiGenerateResult<T = Record<string, unknown>> {
  input: T
  model: string
  finishReason: string
}

// One model as OpenRouter lists it, reduced to what the pickers and the client
// need. The list is fetched live (and cached) — nothing model-specific lives in
// code.
export interface AiModelInfo {
  // OpenRouter model slug, e.g. 'anthropic/claude-sonnet-4.5'.
  id: string
  name: string
  // USD per million tokens; null when OpenRouter reports no price.
  promptPrice: number | null
  completionPrice: number | null
  contextLength: number | null
  // Whether the model accepts sampling params (temperature). Some models
  // reject them with a hard error; the client sends them only when reported.
  supportsTemperature: boolean
  // Whether the model honours prompt caching via `cache_control` (OpenRouter
  // reports cache pricing only for models that do).
  supportsCaching: boolean
}

// A capability a consumer layer wants an admin-selectable model for (e.g. inbox
// draft replies). Registered at boot via `registerAiFeature`; the admin UI lists
// each and lets an operator pick which enabled model powers it.
//
// `kind: 'embedding'` declares that the layer builds a vector index. Such a
// feature gets no per-feature chat model picker; instead its presence makes the
// embedding-model section appear on the AI settings pages.
export interface AiFeature {
  // Stable key, namespaced by the owning layer, e.g. 'inbox.draft'.
  key: string
  label: string
  description?: string
  kind?: 'chat' | 'embedding'
}

// --- Embeddings ---

// Every vector column is AI_EMBED_DIMENSIONS wide (vectors.ts); `embed()`
// always requests that many dimensions so any embedding model an admin picks
// fits the same column.

export interface AiEmbedOptions {
  // Same contract as AiCompleteOptions.tx: the org whose key and embedding
  // model choice apply.
  tx: AiDbClient
  input: string[]
}

export interface AiEmbedResult {
  // One vector per input, in order, each AI_EMBED_DIMENSIONS wide.
  vectors: number[][]
  model: string
}

// One embedding model as OpenRouter lists it.
export interface AiEmbeddingModelInfo {
  id: string
  name: string
  // USD per million input tokens; null when unreported.
  promptPrice: number | null
  contextLength: number | null
}

// A layer that owns a vector index registers one of these so the AI settings
// pages can rebuild every index after the embedding model changes.
// Both functions run inside an org-scoped transaction (or an unscoped one in
// single-tenant mode) — the registrar iterates org scopes.
export interface AiReindexer {
  // Stable key, e.g. 'context.sections'.
  key: string
  label: string
  // Distinct embedding model ids currently stored in this index for the scope.
  currentModels: (tx: AiDbClient) => Promise<string[]>
  // Re-embed everything in the scope with the model that resolves now.
  run: (tx: AiDbClient) => Promise<{ chunks: number }>
}
