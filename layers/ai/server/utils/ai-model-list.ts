import type { AiModelInfo } from '#core/ai-fallback/types'
import type { AiProvider, AiProviderModelInfo } from '../../types/ai-ext'
import { getOpenRouterConfig, getTinfoilConfig, isTinfoilConfigured } from './ai-config'
import { providerOf } from './ai-provider'
import { parseTinfoilModels } from './tinfoil-models'

// The live model list, merged from two catalogs: OpenRouter's public
// `GET /models` and Tinfoil's model catalog (listed only when a Tinfoil key is
// configured). The catalogs are the only source of which models exist, what
// they're called, what they cost, and which parameters they accept — nothing
// model-specific lives in code. Only tool-capable chat models and file-upload
// transcription models are kept.
//
// Each catalog is cached in-process for an hour and served stale while a
// refresh runs, so pickers and generation keep working through a provider
// outage once its list has loaded at least once. A failed refresh backs off
// briefly instead of retrying on every call.
//
// State lives on a global symbol rather than in module scope: Nitro imports
// routes lazily, so two importers may not share a module instance.

const CACHE_TTL_MS = 60 * 60 * 1000
const RETRY_AFTER_MS = 60 * 1000

interface SourceState {
  models: AiProviderModelInfo[]
  nextAttemptAt: number
  inflight: Promise<void> | null
}

interface ModelListState {
  sources: Record<AiProvider, SourceState>
  byId: Map<string, AiProviderModelInfo>
}

const STATE_KEY = Symbol.for('nuxtinator.ai.model-list')

function testModel(overrides: Partial<AiProviderModelInfo> & Pick<AiProviderModelInfo, 'id' | 'name'>): AiProviderModelInfo {
  return {
    promptPrice: null,
    completionPrice: null,
    contextLength: null,
    supportsTemperature: false,
    supportsCaching: false,
    provider: 'openrouter',
    kind: 'chat',
    supportsImages: false,
    requestPrice: null,
    reasoning: null,
    ...overrides
  }
}

// Under VITEST the list is fixed so suites never touch the network.
export const AI_TEST_MODELS: AiProviderModelInfo[] = [
  testModel({ id: 'test/alpha', name: 'Test Alpha', promptPrice: 3, completionPrice: 15, contextLength: 200_000, supportsTemperature: true, supportsCaching: true, supportsImages: true }),
  testModel({ id: 'test/beta', name: 'Test Beta', promptPrice: 0.5, completionPrice: 2, contextLength: 128_000, supportsTemperature: true }),
  testModel({ id: 'test/gamma', name: 'Test Gamma' }),
  testModel({ id: 'test/whisper', name: 'Test Whisper', kind: 'transcription', requestPrice: 0.01 })
]

function emptySource(): SourceState {
  return { models: [], nextAttemptAt: 0, inflight: null }
}

function getState(): ModelListState {
  const g = globalThis as Record<symbol, unknown>
  if (!g[STATE_KEY]) {
    const state: ModelListState = {
      sources: { openrouter: emptySource(), tinfoil: emptySource() },
      byId: new Map()
    }
    if (process.env.VITEST) {
      state.sources.openrouter = { models: AI_TEST_MODELS, nextAttemptAt: Number.POSITIVE_INFINITY, inflight: null }
      state.sources.tinfoil.nextAttemptAt = Number.POSITIVE_INFINITY
      state.byId = new Map(AI_TEST_MODELS.map(m => [m.id, m]))
    }
    g[STATE_KEY] = state
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
// by name. Temperature and reasoning support come from `supported_parameters`;
// caching support from the presence of cache-read pricing, which OpenRouter
// reports only for models that honour prompt caching; image input from
// `architecture.input_modalities`.
export function parseOpenRouterModels(payload: unknown): AiProviderModelInfo[] {
  const data = (payload as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return []
  const out: AiProviderModelInfo[] = []
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
    const architecture = (m.architecture && typeof m.architecture === 'object' ? m.architecture : {}) as Record<string, unknown>
    const inputs = Array.isArray(architecture.input_modalities) ? architecture.input_modalities : []
    const name = typeof m.name === 'string' && m.name.trim() ? m.name.trim() : id
    out.push({
      id,
      name,
      promptPrice: perMillion(pricing.prompt),
      completionPrice: perMillion(pricing.completion),
      contextLength: typeof m.context_length === 'number' && m.context_length > 0 ? m.context_length : null,
      supportsTemperature: params.includes('temperature'),
      supportsCaching: perMillion(pricing.input_cache_read) !== null,
      provider: 'openrouter',
      kind: 'chat',
      supportsImages: inputs.includes('image'),
      requestPrice: null,
      reasoning: params.includes('reasoning')
        ? { enable: { reasoning: { effort: '$EFFORT' } }, disable: { reasoning: { enabled: false } }, effortMap: {} }
        : null
    })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

async function fetchCatalog(provider: AiProvider): Promise<AiProviderModelInfo[]> {
  if (provider === 'tinfoil') {
    const res = await fetch(getTinfoilConfig().catalogUrl, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`Tinfoil catalog ${res.status}`)
    const models = parseTinfoilModels(await res.json())
    if (models.length === 0) throw new Error('Tinfoil returned no usable models')
    return models
  }
  const res = await fetch(`${getOpenRouterConfig().baseUrl}/models`, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`)
  const models = parseOpenRouterModels(await res.json())
  if (models.length === 0) throw new Error('OpenRouter returned no tool-capable models')
  return models
}

function rebuildIndex(state: ModelListState): void {
  state.byId = new Map(
    [...state.sources.openrouter.models, ...state.sources.tinfoil.models].map(m => [m.id, m])
  )
}

async function refresh(state: ModelListState, provider: AiProvider): Promise<void> {
  const source = state.sources[provider]
  try {
    source.models = await fetchCatalog(provider)
    source.nextAttemptAt = Date.now() + CACHE_TTL_MS
    rebuildIndex(state)
  } catch (err) {
    console.error(`[ai] ${provider} model list refresh failed:`, (err as Error)?.message ?? err)
    source.nextAttemptAt = Date.now() + RETRY_AFTER_MS
  }
}

function activeProviders(): AiProvider[] {
  return isTinfoilConfigured() ? ['openrouter', 'tinfoil'] : ['openrouter']
}

async function ensureSource(state: ModelListState, provider: AiProvider): Promise<void> {
  const source = state.sources[provider]
  if (Date.now() < source.nextAttemptAt) return
  if (!source.inflight) {
    source.inflight = refresh(state, provider).finally(() => {
      source.inflight = null
    })
  }
  // Stale-while-revalidate: only the very first load has to wait.
  if (source.models.length > 0) return
  await source.inflight
}

// Every model this deployment can list (chat and transcription), refreshing
// catalogs older than an hour.
export async function getAllModels(): Promise<AiProviderModelInfo[]> {
  const state = getState()
  const providers = process.env.VITEST ? [] : activeProviders()
  await Promise.all(providers.map(p => ensureSource(state, p)))
  const models = [...state.sources.openrouter.models]
  if (process.env.VITEST || isTinfoilConfigured()) models.push(...state.sources.tinfoil.models)
  return models.sort((a, b) => a.name.localeCompare(b.name))
}

// The cached tool-capable chat model list. An empty result means no catalog
// has loaded (providers unreachable since boot); callers treat that as
// "unknown", not as "no models exist".
export async function getModelList(): Promise<AiModelInfo[]> {
  return (await getAllModels()).filter(m => m.kind === 'chat')
}

export async function getTranscriptionModels(): Promise<AiProviderModelInfo[]> {
  return (await getAllModels()).filter(m => m.kind === 'transcription')
}

// Synchronous reads of the cached list. Callers that need the list to be
// present should `await getAllModels()` first.
export function getModelInfo(id: string): AiProviderModelInfo | undefined {
  return getState().byId.get(id)
}

// Whether a stored id still exists in its provider's catalog. Tinfoil ids are
// unknown while no Tinfoil key is configured. With the provider's catalog not
// loaded there is nothing to check against, so the id passes rather than
// every id failing.
export function isKnownModel(id: string): boolean {
  const state = getState()
  const provider = providerOf(id)
  if (provider === 'tinfoil' && !process.env.VITEST && !isTinfoilConfigured()) return false
  if (state.sources[provider].models.length === 0) return true
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
