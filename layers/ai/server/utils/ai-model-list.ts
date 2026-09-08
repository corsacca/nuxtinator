import type { AiModelInfo } from '#core/ai-fallback/types'
import { getOpenRouterConfig } from './ai-config'

// The live model list. OpenRouter's public `GET /models` (no key needed) is
// the only source of which models exist, what they're called, what they cost,
// and which parameters they accept — nothing model-specific lives in code.
// Only tool-capable models are kept: every AI feature relies on tool calling.
//
// Cached in-process for an hour and served stale while a refresh runs, so
// pickers and generation keep working through an OpenRouter outage once the
// list has loaded at least once. A failed refresh backs off briefly instead of
// retrying on every call.
//
// State lives on a global symbol rather than in module scope: Nitro imports
// routes lazily, so two importers may not share a module instance.

const CACHE_TTL_MS = 60 * 60 * 1000
const RETRY_AFTER_MS = 60 * 1000

interface ModelListState {
  models: AiModelInfo[]
  byId: Map<string, AiModelInfo>
  nextAttemptAt: number
  inflight: Promise<AiModelInfo[]> | null
}

const STATE_KEY = Symbol.for('nuxtinator.ai.model-list')

// Under VITEST the list is fixed so suites never touch the network.
export const AI_TEST_MODELS: AiModelInfo[] = [
  { id: 'test/alpha', name: 'Test Alpha', promptPrice: 3, completionPrice: 15, contextLength: 200_000, supportsTemperature: true, supportsCaching: true },
  { id: 'test/beta', name: 'Test Beta', promptPrice: 0.5, completionPrice: 2, contextLength: 128_000, supportsTemperature: true, supportsCaching: false },
  { id: 'test/gamma', name: 'Test Gamma', promptPrice: null, completionPrice: null, contextLength: null, supportsTemperature: false, supportsCaching: false }
]

function getState(): ModelListState {
  const g = globalThis as Record<symbol, unknown>
  if (!g[STATE_KEY]) {
    const seed = process.env.VITEST ? AI_TEST_MODELS : []
    g[STATE_KEY] = {
      models: seed,
      byId: new Map(seed.map(m => [m.id, m])),
      nextAttemptAt: process.env.VITEST ? Number.POSITIVE_INFINITY : 0,
      inflight: null
    } satisfies ModelListState
  }
  return g[STATE_KEY] as ModelListState
}

// OpenRouter prices are USD per token as decimal strings; the pickers show USD
// per million tokens.
function perMillion(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 1e6 * 1e4) / 1e4
}

// Pure: an OpenRouter `GET /models` payload → the tool-capable models, sorted
// by name. Temperature support comes from `supported_parameters`; caching
// support from the presence of cache-read pricing, which OpenRouter reports
// only for models that honour prompt caching.
export function parseOpenRouterModels(payload: unknown): AiModelInfo[] {
  const data = (payload as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return []
  const out: AiModelInfo[] = []
  const seen = new Set<string>()
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue
    const m = raw as Record<string, unknown>
    const id = typeof m.id === 'string' ? m.id.trim() : ''
    if (!id || seen.has(id)) continue
    const params = Array.isArray(m.supported_parameters)
      ? (m.supported_parameters.filter(p => typeof p === 'string') as string[])
      : []
    if (!params.includes('tools')) continue
    seen.add(id)
    const pricing = (m.pricing && typeof m.pricing === 'object' ? m.pricing : {}) as Record<string, unknown>
    const name = typeof m.name === 'string' && m.name.trim() ? m.name.trim() : id
    out.push({
      id,
      name,
      promptPrice: perMillion(pricing.prompt),
      completionPrice: perMillion(pricing.completion),
      contextLength: typeof m.context_length === 'number' && m.context_length > 0 ? m.context_length : null,
      supportsTemperature: params.includes('temperature'),
      supportsCaching: perMillion(pricing.input_cache_read) !== null
    })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

async function refresh(state: ModelListState): Promise<AiModelInfo[]> {
  try {
    const res = await fetch(`${getOpenRouterConfig().baseUrl}/models`)
    if (!res.ok) throw new Error(`OpenRouter ${res.status}`)
    const models = parseOpenRouterModels(await res.json())
    if (models.length === 0) throw new Error('OpenRouter returned no tool-capable models')
    state.models = models
    state.byId = new Map(models.map(m => [m.id, m]))
    state.nextAttemptAt = Date.now() + CACHE_TTL_MS
  } catch (err) {
    console.error('[ai] model list refresh failed:', (err as Error)?.message ?? err)
    state.nextAttemptAt = Date.now() + RETRY_AFTER_MS
  }
  return state.models
}

// The cached tool-capable model list, refreshed when older than an hour. An
// empty result means the list has never loaded (OpenRouter unreachable since
// boot); callers treat that as "unknown", not as "no models exist".
export async function getModelList(): Promise<AiModelInfo[]> {
  const state = getState()
  if (Date.now() < state.nextAttemptAt) return state.models
  if (!state.inflight) {
    state.inflight = refresh(state).finally(() => {
      state.inflight = null
    })
  }
  // Stale-while-revalidate: only the very first load has to wait.
  if (state.models.length > 0) return state.models
  return await state.inflight
}

// Synchronous reads of the cached list. Callers that need the list to be
// present should `await getModelList()` first.
export function getModelInfo(id: string): AiModelInfo | undefined {
  return getState().byId.get(id)
}

// Whether a stored id still exists on OpenRouter. With no list loaded there is
// nothing to check against, so every id passes rather than every id failing.
export function isKnownModel(id: string): boolean {
  const state = getState()
  if (state.models.length === 0) return true
  return state.byId.has(id)
}

// Whether to send sampling params (temperature). Unknown ids default to false —
// a model that rejects sampling params fails hard, whereas losing determinism
// is harmless.
export function supportsTemperature(modelId: string): boolean {
  return getModelInfo(modelId)?.supportsTemperature ?? false
}

// Whether the model honours prompt caching. Unknown ids default to false (cache
// breakpoints become no-ops). Prompt prefixes are kept byte-stable regardless.
export function supportsCaching(modelId: string): boolean {
  return getModelInfo(modelId)?.supportsCaching ?? false
}
