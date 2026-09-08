# AI layer — maintainer notes

Working doc for `@nuxtinator/ai`. [README.md](README.md) is the consumer overview.
This is the shared AI backend built for Phase 10a of the inbox plan
([../apps/inbox/PLAN.md](../apps/inbox/PLAN.md)); the inbox is its first consumer
(Phase 10b), the context assistant its second. It generalizes the Doxa
campaigns-server Anthropic drafting client onto OpenRouter so any layer can use it.

## Decisions (what we chose and why)

- **OpenRouter, plain `fetch`, no SDK.** OpenRouter is OpenAI-compatible, so the
  client is a plain `fetch` to `/chat/completions`. This deliberately sidesteps
  the `@anthropic-ai/sdk` bundling pain the `context` layer hit (its
  `nitro.externals.inline` + shim workaround).
- **Mirrors `#email` exactly.** The real impl lives in this layer and registers
  `#ai/server` unconditionally ([modules/ai-alias.ts](modules/ai-alias.ts)); core
  ships a throwing fallback ([../core/ai-fallback/ai.ts](../core/ai-fallback/ai.ts))
  registered by [../core/modules/ai-kernel.ts](../core/modules/ai-kernel.ts) only
  if unset. So consumers import `#ai/server` unconditionally and gate on
  `isAiConfigured(tx)` — AI is optional at both the layer and key level.
- **Shared types are canonical in core.** [../core/ai-fallback/types.ts](../core/ai-fallback/types.ts)
  owns the `#ai/server` type surface (pure types, no runtime, outside
  `server/utils/` so auto-import ignores it) so the fallback and the real impl
  can't drift. Both `export * from` it.
- **`generate()` = forced single tool call.** OpenRouter tool calling replaces
  Anthropic's `tool_choice: {type:'tool'}`. `generate` forces one tool
  (`tool_choice: {type:'function', function:{name}}`) and returns the parsed
  arguments — the structured-output pattern for drafting/extraction. `length`
  finish-reason throws "cut off" (a truncated forced-tool response is partial
  JSON, not an error).
- **Consumers pass `tx` + `feature`, never a key or model.** `complete` /
  `generate` resolve both themselves ([server/utils/ai-settings.ts](server/utils/ai-settings.ts)).
  The only way to run on the host's key is "this org has none" — no call path
  can spend the host's budget by forgetting an argument.
- **Per-org keys, host key as fallback.** An org stores its own OpenRouter key
  on `/@<slug>/settings/ai` (encrypted with core's secret-crypto, verified
  against OpenRouter's `/auth/key` before storing, never returned to the
  browser). Orgs without one use the env `OPENROUTER_API_KEY`. There is no host
  key UI — the env var is the host key.
- **Whose key decides the allowed set.** On the host's key an org may only pick
  from the host-enabled set (the host controls what its budget runs). On its
  own key it may pick any tool-capable model OpenRouter lists.
- **Nothing model-specific in code.** The live OpenRouter list
  ([server/utils/ai-model-list.ts](server/utils/ai-model-list.ts), public
  `GET /models`, cached an hour, stale-while-revalidate, tool-capable only) is
  the sole source of names, prices, context windows and capability flags
  (`temperature` from `supported_parameters`, caching from cache-read pricing).
  No default-enabled ids, no default model id: a fresh deployment has nothing
  enabled until an operator picks. Model ids in code go stale fast.
- **Two settings scopes that stack.** Host (`core_host_settings`, edited on
  `/admin/ai`): `enabled_models`, `default_model`, `feature_models`. Org
  (`core_settings`, RLS-scoped, edited on the org page): `api_key`,
  `default_model`, `feature_models`. One `registerSetting` per key serves both
  tables. Resolution for a feature: org choice → org default → host choice →
  host default, skipping anything the org may not use right now. Stored choices
  are never deleted on fallback; the pickers mark them unavailable.
- **Org settings shell is extensible via a core registry.** The tenancy settings
  sidebar is a hardcoded list plus everything in core's
  `org-settings-section-registry` (served by `/api/o/<slug>/_settings-sections`,
  permission-filtered). This layer registers `ai` → `/@<slug>/settings/ai` and
  ships the page at `app/pages/@[orgSlug]/settings/ai.vue`, which Nuxt nests
  under tenancy's `settings.vue` because page dirs merge across layers. Gated on
  `org.settings.write` like its sibling tabs.
- **Host page gated on operator-admin, no org context.** `/admin/ai` reads and
  writes the deployment-global store with plain `db` — the `/admin` area is never
  org-prefixed, so its requests carry no X-Active-Org and `withOrgContext` would
  404 there. Its "effective" values are therefore the host chain only.

## Gotchas (hard-won)

1. **Adding routes can trip TS2589 elsewhere.** This layer's `/api/ai/*` routes
   enlarged the typed-route union enough to tip two already-borderline `$fetch`
   call sites (`layers/apps/inbox/.../useInboxRecordConversations.ts`,
   `layers/core/server/utils/layer-updates.ts`) over TypeScript's instantiation
   depth limit. Fix: pin the request generic to `string`
   (`$fetch<T, string>(...)`) so `$fetch` resolves against the fallback branch
   instead of deep-walking the route union. Watch for this when adding endpoints.
2. **VITEST short-circuits at the network boundary.** `isAiConfigured(tx)` returns
   true under VITEST (no key needed); `generate`/`complete` route to the
   primeable fake in [server/utils/ai-test-fake.ts](server/utils/ai-test-fake.ts);
   the model list is the fixed `AI_TEST_MODELS` (alpha/beta/gamma); `validateApiKey`
   accepts anything but the literal `invalid`; a feature with nothing configured
   runs on `test/alpha` so consumer suites need no host config. Unprimed,
   `complete` returns `[[stub:<model>]]` and `generate` a schema-shaped stub.
3. **New server files need a dev-server restart** (Nitro's dev scan misses files
   created after boot — the register plugin silently won't run). Same as every
   other layer.
4. **`NUXT_SECRET_ENCRYPTION_KEY` must be set** wherever an org will store a key;
   `setOrgApiKey` surfaces the missing-key error as a 500 with the reason.
   Rotating it makes every stored org key `undecryptable` — the org page shows
   the state and offers Remove; generation for that org errors rather than
   silently falling back to the host key.
5. **Empty model list ≠ no models.** If OpenRouter is unreachable since boot the
   list is empty; `isKnownModel` then passes every id so stored choices keep
   working, and the pages show a "model list unavailable" notice instead of
   emptying the pickers.

## Files

- Client: [server/utils/ai-client.ts](server/utils/ai-client.ts) (OpenRouter fetch,
  key/model resolution, key verification, error map) · env config
  [server/utils/ai-config.ts](server/utils/ai-config.ts) · tool loop
  [server/utils/ai-tool-loop.ts](server/utils/ai-tool-loop.ts) (pure, unit-tested)
  · stream reader [server/utils/ai-stream.ts](server/utils/ai-stream.ts) (pure, unit-tested)
  · VITEST fake [server/utils/ai-test-fake.ts](server/utils/ai-test-fake.ts)
  + control route [server/routes/api/_test/ai.ts](server/routes/api/_test/ai.ts)
  · live model list [server/utils/ai-model-list.ts](server/utils/ai-model-list.ts)
  · settings + resolution [server/utils/ai-settings.ts](server/utils/ai-settings.ts)
  · feature registry [server/utils/ai-feature-registry.ts](server/utils/ai-feature-registry.ts).
- Barrel: [server/exports/index.ts](server/exports/index.ts) (`#ai/server`) ·
  client types [app/utils/ai-manifest.ts](app/utils/ai-manifest.ts) (`#ai`).
- Boot: [server/plugins/register-ai.ts](server/plugins/register-ai.ts) (settings,
  admin section, org settings section).
- Endpoints: [server/routes/api/ai/models.get.ts](server/routes/api/ai/models.get.ts)
  · [server/routes/api/ai/admin/config.{get,put}.ts](server/routes/api/ai/admin/)
  · [server/routes/api/ai/org/config.{get,put}.ts](server/routes/api/ai/org/)
  · [server/routes/api/ai/org/key.{put,delete}.ts](server/routes/api/ai/org/)
  · [server/routes/api/ai/status.get.ts](server/routes/api/ai/status.get.ts).
- UI: [app/components/AiModelSelect.vue](app/components/AiModelSelect.vue)
  (searchable picker) · [app/utils/ai-model-meta.ts](app/utils/ai-model-meta.ts)
  · host page [app/pages/admin/ai/index.vue](app/pages/admin/ai/index.vue)
  · org page [app/pages/@[orgSlug]/settings/ai.vue](app/pages/@[orgSlug]/settings/ai.vue).
- Tests: [tests/unit/ai-model-list.test.ts](tests/unit/ai-model-list.test.ts) (parser)
  · [tests/unit/ai-tool-loop.test.ts](tests/unit/ai-tool-loop.test.ts) (pure)
  · [tests/unit/ai-stream.test.ts](tests/unit/ai-stream.test.ts) (pure)
  · [tests/api/ai-admin.test.ts](tests/api/ai-admin.test.ts) (host endpoints,
  gating, validation, cross-org sharing)
  · [tests/api/ai-org.test.ts](tests/api/ai-org.test.ts) (org key lifecycle,
  allowed set, resolution chain, isolation, audit).

## Consumers

- inbox — `generate` for draft replies and knowledge extraction.
- context — `complete` with `load_section` / `load_portfolio` tools for the
  portfolio assistant (feature `context.assistant`).

## Follow-ups

- Real generation is only exercisable with a key set (tests use the VITEST
  stub). Smoke-test live once a key is wired.
