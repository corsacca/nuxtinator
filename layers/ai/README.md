# @nuxtinator/ai

An optional, shared AI backend any layer can consume. Backed by
[OpenRouter](https://openrouter.ai) — one OpenAI-compatible chat-completions API,
many models. The host admin chooses which models the host's key may run and
which model powers each AI feature; each organization can bring its own
OpenRouter key and override those choices.

## What you get

- **`#ai/server`** — server helpers for consumer layers:
  - `isAiConfigured(tx)` — can this org generate (its own key, or the host's
    fallback)? Gate your UI on this.
  - `complete({ tx, feature, … })` — chat completion → assistant text. Pass
    `tools` plus an `onToolCall` handler and the model may call them; each
    result is fed back and the loop ends on a text answer (or a forced one after
    `maxToolRounds`).
  - `generate({ tx, feature, tool, … })` — force a single tool call, return its
    parsed arguments as structured output (the pattern for AI-drafting,
    extraction, classification).
  - Both take the caller's `tx` and a feature key and resolve the key and model
    themselves: the org's own when it has them, the host's otherwise.
  - `resolveFeatureModel(tx, featureKey)` / `getAllowedModels(tx)` — the model a
    feature runs on for this org, and the models this org may pick.
  - `registerAiFeature({ key, label })` — declare a capability so it appears in
    the model pickers.
- **Admin → AI** page (`/admin/ai`, operator-admin) — enable models from a
  searchable OpenRouter list, pick the host default and the model per feature.
- **Org settings → AI** page (`/@<slug>/settings/ai`, `org.settings.write`) —
  bring your own OpenRouter key, pick the org's default and per-feature models.
  Registered into the tenancy settings shell through core's
  org-settings-section registry; absent in single-tenant deployments.
- **`GET /api/ai/status`** — org-aware readiness probe (`configured`,
  `hasEnabledModel`, `featureAvailable`) for consumer client UIs.
- **`GET /api/ai/models`** — the live, tool-capable OpenRouter model list
  (cached an hour) for pickers.

Core ships a throwing `#ai/server` fallback, so a consumer layer can import
`#ai/server` unconditionally and simply gate on `isAiConfigured(tx)` — the app
still builds and runs with the AI layer (or any key) absent.

## Setup

1. Add the layer to `extends:` (via `layers.ts` in a prod host, or `dev/layers.ts`).
2. Set the env:

   ```bash
   NUXT_SECRET_ENCRYPTION_KEY=<64 hex chars>   # core; encrypts stored org keys
   # optional — the host-wide fallback key for orgs without their own:
   OPENROUTER_API_KEY=sk-or-...
   OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
   AI_HTTP_REFERER=https://your-app.example    # OpenRouter attribution
   AI_APP_TITLE=Your App
   ```

3. Open **Admin → AI**, enable at least one model and choose a default. Nothing
   is enabled on a fresh deployment — the code carries no model ids, so AI
   features stay off until an admin picks.

## Whose key, whose models

| Org has its own key? | Key used | Models the org may pick |
|---|---|---|
| No | host `OPENROUTER_API_KEY` | the host-enabled set |
| Yes | the org's key | any tool-capable model OpenRouter lists |

A feature resolves to the first usable model in: the org's choice for the
feature → the org's default → the host's choice for the feature → the host's
default. A choice that is no longer usable (key removed, model delisted) is
skipped, not deleted, and shows as unavailable in the pickers.

## Consuming it from another layer

```ts
import { isAiConfigured, generate, registerAiFeature } from '#ai/server'

// At boot (a Nitro plugin): declare your feature so it gets a model picker.
registerAiFeature({ key: 'inbox.draft', label: 'Inbox — draft replies' })

// In a handler (inside the org tx):
if (!(await isAiConfigured(tx))) throw createError({ statusCode: 503, statusMessage: 'AI is not configured' })
const { input } = await generate<{ reply: string }>({
  tx,
  feature: 'inbox.draft',
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
route to a primeable fake, the model list is a fixed three-model set
(`test/alpha`, `test/beta`, `test/gamma`), and any key other than the literal
`invalid` verifies. A feature with no configured model runs on `test/alpha`.
Script the fake over `/api/_test/ai` (only served under VITEST) with the helpers
exported from this layer's `tests/helpers`:

```ts
await primeAiFake({ text: 'Here is the answer.', toolCalls: [{ name: 'load_section', input: { section_key: 'team' } }] })
// ... call your endpoint ...
const log = await getAiFakeLog()   // what the model was asked, and each tool result
await resetAiFake()
```

## Notes

- **Nothing model-specific lives in code.** Names, prices, context windows and
  capability flags come from OpenRouter's model list; the DB stores only the
  ids an admin or org chose. Host choices live in `core_host_settings`
  (deployment-global), org choices and the org key in `core_settings`
  (RLS-scoped per org), both under namespace `ai`.
- **Org keys are encrypted at rest** with core's secret-crypto and never
  returned to the browser (only the last four characters). Rotating
  `NUXT_SECRET_ENCRYPTION_KEY` makes every stored org key unreadable; the org
  page then asks for it to be removed and re-entered.
- **Sampling params are guarded per model.** Some models reject `temperature`;
  the client only sends it to models OpenRouter reports as accepting it.
- **Prompt caching** rides through via `cache_control` to models OpenRouter
  prices cache reads for; keep your grounding prefix byte-stable so
  caching-capable models hit it. The tool loop sends the tool definitions on
  every round (past `maxToolRounds` it adds `tool_choice: 'none'` rather than
  dropping them) because the definitions lead the cached prefix. Each round
  trip logs `[ai] <model> prompt=… cached=… cache_write=…` so hits can be
  checked in the server log.
