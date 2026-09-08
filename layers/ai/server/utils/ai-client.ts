import { createError } from 'h3'
import type {
  AiCompleteOptions,
  AiCompleteResult,
  AiContent,
  AiDbClient,
  AiGenerateOptions,
  AiGenerateResult,
  AiMessage,
  AiTextPart
} from '#core/ai-fallback/types'
import { getOpenRouterConfig, getHostApiKey } from './ai-config'
import { getModelList, supportsTemperature } from './ai-model-list'
import { getOrgApiKey, getEffectiveApiKey, resolveFeatureModel } from './ai-settings'
import { runCompletionLoop, type ProviderCall, type ProviderToolCall, type ProviderTurn } from './ai-tool-loop'
import { readCompletionStream, type StreamedTurn } from './ai-stream'
import { aiFakeComplete, aiFakeGenerate } from './ai-test-fake'

// OpenRouter client. OpenRouter is OpenAI-compatible, so this is a plain fetch
// to `${baseUrl}/chat/completions` — no SDK, sidestepping the `@anthropic-ai/sdk`
// bundling caveats. `complete()` returns assistant text, resolving any tool
// calls the model makes through the caller's handler (see ai-tool-loop.ts);
// `generate()` forces a single tool call and returns its parsed arguments as
// structured output. Given `onTextDelta`, `complete()` streams each round and
// hands reply text over as it arrives (ai-stream.ts reassembles the turn).
//
// Both take the caller's `tx` and a feature key and resolve the key and model
// themselves (ai-settings.ts): the org's own key and choices when it has them,
// the host's otherwise. Under VITEST both route to the primeable fake in
// ai-test-fake.ts instead of the network.
//
// Error contract (consumers branch on these): 503 = not configured; 502 =
// transient upstream (retry); 500 = auth/other misconfig (check server logs).
// The raw provider message is never forwarded to the client.

// Under VITEST a feature with no configured model still runs against the fake.
const AI_TEST_FALLBACK_MODEL = 'test/alpha'

// Whether live generation is possible for the active org: its own key, or the
// host's env key when it has none. Under VITEST it's always "configured" so
// suites run without a key — the network boundary is stubbed below.
export async function isAiConfigured(tx: AiDbClient): Promise<boolean> {
  if (process.env.VITEST) return true
  const org = await getOrgApiKey(tx)
  if (org.status === 'ok') return true
  if (org.status === 'undecryptable') return false
  return !!getHostApiKey()
}

interface ResolvedRun {
  apiKey: string
  model: string
}

async function resolveRun(tx: AiDbClient, feature: string): Promise<ResolvedRun> {
  // Warm the list so the synchronous capability lookups in buildBody see it.
  await getModelList()
  const model = await resolveFeatureModel(tx, feature)
  if (process.env.VITEST) return { apiKey: 'test', model: model || AI_TEST_FALLBACK_MODEL }
  const apiKey = await getEffectiveApiKey(tx)
  if (!apiKey) {
    throw createError({ statusCode: 503, statusMessage: 'AI is not configured (no API key for this organization or the host).' })
  }
  if (!model) {
    throw createError({ statusCode: 503, statusMessage: 'No AI model is enabled for this feature.' })
  }
  return { apiKey, model }
}

export interface AiKeyCheck {
  ok: boolean
  // OpenRouter's label for the key, when it reports one.
  label: string
  // Human-readable reason when not ok.
  message: string
}

// Verify a key against OpenRouter's key-info endpoint before storing it.
// Under VITEST any non-empty key other than the literal 'invalid' passes.
export async function validateApiKey(key: string): Promise<AiKeyCheck> {
  if (process.env.VITEST) {
    return key && key !== 'invalid'
      ? { ok: true, label: 'test', message: '' }
      : { ok: false, label: '', message: 'OpenRouter rejected this key.' }
  }
  const cfg = getOpenRouterConfig()
  let res: Response
  try {
    res = await fetch(`${cfg.baseUrl}/auth/key`, { headers: { Authorization: `Bearer ${key}` } })
  } catch {
    return { ok: false, label: '', message: 'Could not reach OpenRouter to verify the key. Try again in a moment.' }
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, label: '', message: 'OpenRouter rejected this key.' }
  }
  if (!res.ok) {
    return { ok: false, label: '', message: `OpenRouter answered ${res.status} while verifying the key. Try again in a moment.` }
  }
  const data = await res.json().catch(() => ({})) as { data?: { label?: unknown } }
  return { ok: true, label: typeof data?.data?.label === 'string' ? data.data.label : '', message: '' }
}

// Our content model → OpenAI-compatible content. A parts array becomes the
// content-parts form, forwarding Anthropic `cache_control` on parts flagged
// cacheable (a no-op on non-caching models).
function toApiContent(content: AiContent): unknown {
  if (typeof content === 'string') return content
  return content.map((p: AiTextPart) => ({
    type: 'text',
    text: p.text,
    ...(p.cache ? { cache_control: { type: 'ephemeral' } } : {})
  }))
}

function toApiMessages(system: AiContent | undefined, messages: AiMessage[]): unknown[] {
  const out: unknown[] = []
  if (system !== undefined) out.push({ role: 'system', content: toApiContent(system) })
  for (const m of messages) out.push({ role: m.role, content: toApiContent(m.content) })
  return out
}

function buildBody(
  model: string,
  apiMessages: unknown[],
  maxTokens: number,
  temperature: number | undefined,
  extra: Record<string, unknown>
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: apiMessages,
    max_tokens: maxTokens
  }
  // Only send sampling params to models that accept them — some models 400 on
  // an unrecognised `temperature`.
  if (temperature !== undefined && supportsTemperature(model)) {
    body.temperature = temperature
  }
  return { ...body, ...extra }
}

async function openRouterRequest(apiKey: string, body: Record<string, unknown>): Promise<Response> {
  const cfg = getOpenRouterConfig()

  let res: Response
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(cfg.referer ? { 'HTTP-Referer': cfg.referer } : {}),
        ...(cfg.title ? { 'X-Title': cfg.title } : {})
      },
      body: JSON.stringify(body)
    })
  } catch {
    // Network/connection failure — retryable.
    throw createError({
      statusCode: 502,
      statusMessage: 'AI request failed to reach the provider. Try again in a moment.'
    })
  }

  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 500)
    } catch {
      // ignore — the status alone drives the mapping
    }
    if (!process.env.VITEST) {
      console.error(`[ai] OpenRouter ${res.status}: ${detail}`)
    }
    if (res.status === 429 || res.status >= 500) {
      throw createError({ statusCode: 502, statusMessage: 'The AI provider is busy. Try again in a moment.' })
    }
    if (res.status === 401 || res.status === 403) {
      throw createError({ statusCode: 500, statusMessage: 'AI provider auth failed — check the server logs.' })
    }
    throw createError({ statusCode: 500, statusMessage: 'AI request was rejected — check the server logs.' })
  }

  return res
}

async function callOpenRouter(apiKey: string, body: Record<string, unknown>): Promise<any> {
  const res = await openRouterRequest(apiKey, body)
  const data = await res.json()
  logUsage(String(body.model), data?.usage)
  return data
}

// The same request with `stream: true`, reassembled from the SSE body while
// text fragments go to `onTextDelta`.
async function streamOpenRouter(
  apiKey: string,
  body: Record<string, unknown>,
  onTextDelta: (delta: string) => void
): Promise<StreamedTurn> {
  const res = await openRouterRequest(apiKey, { ...body, stream: true })
  if (!res.body) {
    throw createError({ statusCode: 502, statusMessage: 'The AI provider returned an empty stream. Try again.' })
  }
  const turn = await readCompletionStream(textChunks(res.body), onTextDelta)
  logUsage(String(body.model), turn.usage)
  return turn
}

async function* textChunks(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      yield decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
}

// One line per round trip so prompt-cache hits can be verified from the server
// log; OpenRouter reports cache reads and writes under prompt_tokens_details.
function logUsage(model: string, usage: any): void {
  if (!usage || typeof usage !== 'object') return
  const details = usage.prompt_tokens_details ?? {}
  const cost = typeof usage.cost === 'number' ? ` cost=$${usage.cost.toFixed(4)}` : ''
  console.info(
    `[ai] ${model} prompt=${usage.prompt_tokens ?? 0} cached=${details.cached_tokens ?? 0}`
    + ` cache_write=${details.cache_write_tokens ?? 0} completion=${usage.completion_tokens ?? 0}${cost}`
  )
}

// A `length` finish means the answer was cut off; both transports map it to
// the same retryable error.
function finishTurn(text: string, finishReason: string, toolCalls: ProviderToolCall[]): ProviderTurn {
  if (finishReason === 'length') {
    throw createError({ statusCode: 502, statusMessage: 'The AI response was cut off. Try again.' })
  }
  return { text: text.trim(), finishReason, toolCalls }
}

// One chat-completions round trip in the shape the tool loop consumes,
// streamed when the caller wants text as it arrives.
function providerCall(
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number | undefined,
  onTextDelta: ((delta: string) => void) | undefined
): ProviderCall {
  return async (apiMessages, apiTools, allowToolCalls) => {
    const body = buildBody(model, apiMessages, maxTokens, temperature, {
      ...(apiTools ? { tools: apiTools } : {}),
      ...(apiTools && !allowToolCalls ? { tool_choice: 'none' } : {})
    })
    if (onTextDelta) {
      const turn = await streamOpenRouter(apiKey, body, onTextDelta)
      return finishTurn(turn.text, turn.finishReason, turn.toolCalls)
    }
    const data = await callOpenRouter(apiKey, body)
    const choice = data.choices?.[0]
    const rawCalls: any[] = Array.isArray(choice?.message?.tool_calls) ? choice.message.tool_calls : []
    return finishTurn(
      String(choice?.message?.content ?? ''),
      choice?.finish_reason ?? 'stop',
      rawCalls.map(tc => ({
        id: String(tc.id ?? ''),
        name: String(tc.function?.name ?? ''),
        arguments: String(tc.function?.arguments ?? '')
      }))
    )
  }
}

export async function complete(opts: AiCompleteOptions): Promise<AiCompleteResult> {
  const { apiKey, model } = await resolveRun(opts.tx, opts.feature)
  if (process.env.VITEST) return aiFakeComplete(opts, model)

  const result = await runCompletionLoop(
    providerCall(apiKey, model, opts.maxTokens ?? 2048, opts.temperature, opts.onTextDelta),
    {
      apiMessages: toApiMessages(opts.system, opts.messages),
      tools: opts.tools,
      onToolCall: opts.onToolCall,
      maxToolRounds: opts.maxToolRounds ?? 4,
      onTextDiscard: opts.onTextDiscard
    }
  )
  return { ...result, model }
}

// Force the model to call `opts.tool` and return its parsed arguments. A
// truncated forced-tool response comes back as partial JSON (not an error), so
// the `length` finish-reason is checked explicitly before parsing.
export async function generate<T = Record<string, unknown>>(
  opts: AiGenerateOptions
): Promise<AiGenerateResult<T>> {
  const { apiKey, model } = await resolveRun(opts.tx, opts.feature)
  if (process.env.VITEST) return aiFakeGenerate<T>(opts, model)

  const body = buildBody(model, toApiMessages(opts.system, opts.messages), opts.maxTokens ?? 8192, opts.temperature, {
    tools: [
      {
        type: 'function',
        function: {
          name: opts.tool.name,
          description: opts.tool.description,
          parameters: opts.tool.parameters
        }
      }
    ],
    tool_choice: { type: 'function', function: { name: opts.tool.name } }
  })

  const data = await callOpenRouter(apiKey, body)
  const choice = data.choices?.[0]
  const finishReason: string = choice?.finish_reason ?? 'stop'
  if (finishReason === 'length') {
    throw createError({
      statusCode: 502,
      statusMessage: 'The AI response was cut off before finishing. Try again.'
    })
  }
  if (finishReason === 'content_filter') {
    throw createError({ statusCode: 502, statusMessage: 'The AI provider refused the request.' })
  }

  const args = choice?.message?.tool_calls?.[0]?.function?.arguments
  if (!args) {
    throw createError({ statusCode: 502, statusMessage: 'The AI did not return a structured result. Try again.' })
  }
  let input: T
  try {
    input = JSON.parse(args)
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'The AI returned an unparseable result. Try again.' })
  }
  return { input, model, finishReason }
}
