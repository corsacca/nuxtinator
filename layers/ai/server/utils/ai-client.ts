import { createError } from 'h3'
import type {
  AiCompleteOptions,
  AiCompleteResult,
  AiContent,
  AiGenerateOptions,
  AiGenerateResult,
  AiMessage,
  AiTextPart
} from '#core/ai-fallback/types'
import { supportsTemperature } from './ai-models'

// OpenRouter client. OpenRouter is OpenAI-compatible, so this is a plain fetch
// to `${baseUrl}/chat/completions` — no SDK, sidestepping the `@anthropic-ai/sdk`
// bundling caveats. `generate()` forces a single tool call and returns its
// parsed arguments as structured output; `complete()` returns assistant text.
//
// Error contract (consumers branch on these): 503 = not configured; 502 =
// transient upstream (retry); 500 = auth/other misconfig (check server logs).
// The raw provider message is never forwarded to the client.

interface OpenRouterConfig {
  apiKey: string
  baseUrl: string
  referer: string
  title: string
}

function getConfig(): OpenRouterConfig {
  const c = useRuntimeConfig()
  return {
    apiKey: (c.openrouterApiKey as string) || process.env.OPENROUTER_API_KEY || '',
    baseUrl: ((c.openrouterBaseUrl as string) || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
    referer: (c.aiHttpReferer as string) || '',
    title: (c.aiAppTitle as string) || ''
  }
}

// Whether live generation is possible. Under VITEST it's always "configured" so
// suites run without a key — the network boundary is stubbed below.
export function isAiConfigured(): boolean {
  if (process.env.VITEST) return true
  return !!getConfig().apiKey
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
  system: AiContent | undefined,
  messages: AiMessage[],
  maxTokens: number,
  temperature: number | undefined,
  extra: Record<string, unknown>
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: toApiMessages(system, messages),
    max_tokens: maxTokens
  }
  // Only send sampling params to models that accept them — some models 400 on
  // an unrecognised `temperature`.
  if (temperature !== undefined && supportsTemperature(model)) {
    body.temperature = temperature
  }
  return { ...body, ...extra }
}

async function callOpenRouter(body: Record<string, unknown>): Promise<any> {
  const cfg = getConfig()
  if (!cfg.apiKey) {
    throw createError({ statusCode: 503, statusMessage: 'AI is not configured (OPENROUTER_API_KEY missing).' })
  }

  let res: Response
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
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

  return res.json()
}

export async function complete(opts: AiCompleteOptions): Promise<AiCompleteResult> {
  if (process.env.VITEST) {
    return { text: `[[stub:${opts.model}]]`, model: opts.model, finishReason: 'stop' }
  }

  const data = await callOpenRouter(
    buildBody(opts.model, opts.system, opts.messages, opts.maxTokens ?? 2048, opts.temperature, {})
  )
  const choice = data.choices?.[0]
  const finishReason: string = choice?.finish_reason ?? 'stop'
  if (finishReason === 'length') {
    throw createError({ statusCode: 502, statusMessage: 'The AI response was cut off. Try again.' })
  }
  const text = String(choice?.message?.content ?? '').trim()
  return { text, model: opts.model, finishReason }
}

// Force the model to call `opts.tool` and return its parsed arguments. A
// truncated forced-tool response comes back as partial JSON (not an error), so
// the `length` finish-reason is checked explicitly before parsing.
export async function generate<T = Record<string, unknown>>(
  opts: AiGenerateOptions
): Promise<AiGenerateResult<T>> {
  if (process.env.VITEST) {
    return { input: stubToolInput(opts) as T, model: opts.model, finishReason: 'tool_calls' }
  }

  const body = buildBody(opts.model, opts.system, opts.messages, opts.maxTokens ?? 8192, opts.temperature, {
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

  const data = await callOpenRouter(body)
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
  return { input, model: opts.model, finishReason }
}

// Deterministic schema-shaped stub for VITEST: fills each declared property with
// a value of the right JSON type so a consumer's `required` fields are present.
function stubToolInput(opts: AiGenerateOptions): Record<string, unknown> {
  const schema = opts.tool.parameters as { properties?: Record<string, { type?: string }> }
  const props = schema.properties ?? {}
  const out: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(props)) {
    switch (spec?.type) {
      case 'number':
      case 'integer':
        out[key] = 0
        break
      case 'boolean':
        out[key] = false
        break
      case 'array':
        out[key] = []
        break
      case 'object':
        out[key] = {}
        break
      default:
        out[key] = `stub-${key}`
    }
  }
  return out
}
