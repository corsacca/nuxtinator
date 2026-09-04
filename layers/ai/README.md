# @nuxtinator/ai

An optional, shared AI backend any layer can consume. Backed by
[OpenRouter](https://openrouter.ai) — one OpenAI-compatible chat-completions API,
many models, one key. The admin chooses which models are available and which
model powers each AI feature.

## What you get

- **`#ai/server`** — server helpers for consumer layers:
  - `isAiConfigured()` — is an API key present (gate your UI on this).
  - `complete(opts)` — chat completion → assistant text. Pass `tools` plus an
    `onToolCall` handler and the model may call them; each result is fed back
    and the loop ends on a text answer (or a forced one after `maxToolRounds`).
  - `generate(opts)` — force a single tool call, return its parsed arguments as
    structured output (the pattern for AI-drafting, extraction, classification).
  - `getFeatureModel(tx, featureKey)` / `getEnabledModels(tx)` — resolve the
    deployment's model for a feature.
  - `registerAiFeature({ key, label })` — declare a capability so it appears in
    the admin model picker.
- **Admin → AI** page (`/admin/ai`, operator-admin) — enable/disable models, add
  custom OpenRouter model ids, pick the model per feature.
- **`GET /api/ai/status`** — auth-gated readiness probe (`configured`,
  `hasEnabledModel`, `featureAvailable`) for consumer client UIs.

Core ships a throwing `#ai/server` fallback, so a consumer layer can import
`#ai/server` unconditionally and simply gate on `isAiConfigured()` — the app
still builds and runs with the AI layer (or the key) absent.

## Setup

1. Add the layer to `extends:` (via `layers.ts` in a prod host, or `dev/layers.ts`).
2. Set the env:

   ```bash
   OPENROUTER_API_KEY=sk-or-...        # required for live generation
   # optional:
   OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
   AI_HTTP_REFERER=https://your-app.example    # OpenRouter attribution
   AI_APP_TITLE=Your App
   ```

   Without a key the layer still loads and the admin page still saves model
   selections — generation just returns `503` until a key is present.

3. Open **Admin → AI** and enable the models you want. The default set is a
   small curated catalog; add any OpenRouter model id as a custom entry.

## Consuming it from another layer

```ts
import { isAiConfigured, generate, getFeatureModel, registerAiFeature } from '#ai/server'

// At boot (a Nitro plugin): declare your feature so it gets a model picker.
registerAiFeature({ key: 'inbox.draft', label: 'Inbox — draft replies' })

// In a handler (inside the org tx):
if (!isAiConfigured()) throw createError({ statusCode: 503, statusMessage: 'AI is not configured' })
const model = await getFeatureModel(tx, 'inbox.draft')
const { input } = await generate<{ reply: string }>({
  model,
  system: [{ type: 'text', text: bigGroundingPrefix, cache: true }], // cache: prompt-cache on capable models
  messages: [{ role: 'user', content: 'Draft a reply to …' }],
  tool: {
    name: 'submit_draft',
    description: 'Submit the drafted reply',
    parameters: { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'] }
  }
})
```

## Testing against the fake

Under VITEST the client never touches the network: `complete()` and `generate()`
route to a primeable fake. Script it over `/api/_test/ai` (only served under
VITEST) with the helpers exported from this layer's `tests/helpers`:

```ts
await primeAiFake({ text: 'Here is the answer.', toolCalls: [{ name: 'load_section', input: { section_key: 'team' } }] })
// ... call your endpoint ...
const log = await getAiFakeLog()   // what the model was asked, and each tool result
await resetAiFake()
```

## Notes

- **Model config is host-level** (stored in `core_host_settings`, namespace
  `ai`): one enabled set for the whole deployment in both single- and
  multi-tenant mode, since every model spends the deployment's shared API key.
  Only the explicit enable/disable, custom ids, and per-feature choices are
  persisted — the model
  catalog and its defaults live in code ([server/utils/ai-models.ts](server/utils/ai-models.ts)).
  Adding a model or changing a default is a code edit, never a migration.
- **Sampling params are guarded per model.** Some models reject `temperature`;
  the client only sends it to models the catalog marks `supportsTemperature`.
- **Prompt caching** rides through to Anthropic models via `cache_control`; keep
  your grounding prefix byte-stable so caching-capable models hit it.
