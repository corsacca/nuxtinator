# AI layer — maintainer notes

Working doc for `@nuxtinator/ai`. [README.md](README.md) is the consumer overview.
This is the shared AI backend built for Phase 10a of the inbox plan
([../apps/inbox/PLAN.md](../apps/inbox/PLAN.md)); the inbox is its first consumer
(Phase 10b). It generalizes the Doxa campaigns-server Anthropic drafting client
onto OpenRouter so any layer can use it.

## Decisions (what we chose and why)

- **OpenRouter, plain `fetch`, no SDK.** OpenRouter is OpenAI-compatible, so the
  client is a plain `fetch` to `/chat/completions`. This deliberately sidesteps
  the `@anthropic-ai/sdk` bundling pain the `context` layer hit (its
  `nitro.externals.inline` + shim workaround). One `OPENROUTER_API_KEY`, many
  models.
- **Mirrors `#email` exactly.** The real impl lives in this layer and registers
  `#ai/server` unconditionally ([modules/ai-alias.ts](modules/ai-alias.ts)); core
  ships a throwing fallback ([../core/ai-fallback/ai.ts](../core/ai-fallback/ai.ts))
  registered by [../core/modules/ai-kernel.ts](../core/modules/ai-kernel.ts) only
  if unset. So consumers import `#ai/server` unconditionally and gate on
  `isAiConfigured()` — AI is optional at both the layer and key level.
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
- **Persisted-state: catalog in code, overrides in DB.** [server/utils/ai-models.ts](server/utils/ai-models.ts)
  is the code-owned catalog (id, label, capability flags, default-enabled).
  `core_host_settings` namespace `ai` (deployment-global) stores only `enabled_models` / `custom_models` /
  `feature_models` overrides. Adding a model or default is a code edit, not a
  migration. **No migration in this layer.**
- **Free-text custom model ids.** Beyond the curated catalog, an admin can add
  any OpenRouter id (free-text) — a new model is adoptable without a code change.
  Custom ids default `supportsTemperature/supportsCaching` off (safer: an unknown
  model that rejects sampling params errors hard).
- **Per-feature model, not one global model.** Consumers `registerAiFeature`;
  each feature resolves its own model (`getFeatureModel`), falling back to the
  default model, then any enabled model.
- **Model config gated on operator-admin, host-level.** Model enablement spends
  the shared API budget, so the admin endpoints use `requireOperatorAdmin` and
  read/write the deployment-global `core_host_settings` store (`getHostSetting`
  / `setHostSetting`) with no org context — `/admin/ai` lives under the org-less
  `/admin` area, so its requests never carry an active org. The section carries
  no `requiredPermission` — it rides the operator-gated `/admin` area.

## Gotchas (hard-won)

1. **Adding routes can trip TS2589 elsewhere.** This layer's `/api/ai/*` routes
   enlarged the typed-route union enough to tip two already-borderline `$fetch`
   call sites (`layers/apps/inbox/.../useInboxRecordConversations.ts`,
   `layers/core/server/utils/layer-updates.ts`) over TypeScript's instantiation
   depth limit. Fix: pin the request generic to `string`
   (`$fetch<T, string>(...)`) so `$fetch` resolves against the fallback branch
   instead of deep-walking the route union. Watch for this when adding endpoints.
2. **VITEST short-circuits at the network boundary.** `isAiConfigured()` returns
   true under VITEST (no key needed); `generate`/`complete` route to the
   primeable fake in [server/utils/ai-test-fake.ts](server/utils/ai-test-fake.ts).
   Unprimed, `complete` returns `[[stub:<model>]]` and `generate` a schema-shaped
   stub (each declared tool property filled with a value of the right JSON
   type, so a consumer's `required` fields are present). Suites script answers
   and tool calls over `/api/_test/ai` and read back the call log.
3. **New server files need a dev-server restart** (Nitro's dev scan misses files
   created after boot — the register plugin silently won't run). Same as every
   other layer.

## Files

- Client: [server/utils/ai-client.ts](server/utils/ai-client.ts) (OpenRouter fetch,
  error map) · tool loop [server/utils/ai-tool-loop.ts](server/utils/ai-tool-loop.ts)
  (pure, unit-tested) · VITEST fake [server/utils/ai-test-fake.ts](server/utils/ai-test-fake.ts)
  + control route [server/routes/api/_test/ai.ts](server/routes/api/_test/ai.ts) · catalog [server/utils/ai-models.ts](server/utils/ai-models.ts)
  · settings [server/utils/ai-settings.ts](server/utils/ai-settings.ts) · feature
  registry [server/utils/ai-feature-registry.ts](server/utils/ai-feature-registry.ts).
- Barrel: [server/exports/index.ts](server/exports/index.ts) (`#ai/server`) ·
  client types [app/utils/ai-manifest.ts](app/utils/ai-manifest.ts) (`#ai`).
- Boot: [server/plugins/register-ai.ts](server/plugins/register-ai.ts) (settings +
  admin section).
- Endpoints: [server/routes/api/ai/admin/config.{get,put}.ts](server/routes/api/ai/admin/)
  · [server/routes/api/ai/status.get.ts](server/routes/api/ai/status.get.ts).
- Admin UI: [app/pages/admin/ai/index.vue](app/pages/admin/ai/index.vue).
- Tests: [tests/unit/ai-models.test.ts](tests/unit/ai-models.test.ts) (pure) ·
  [tests/unit/ai-tool-loop.test.ts](tests/unit/ai-tool-loop.test.ts) (pure) ·
  [tests/api/ai-admin.test.ts](tests/api/ai-admin.test.ts) (endpoints, gating,
  merge, sanitization, cross-org sharing).

## Consumers

- inbox — `generate` for draft replies and knowledge extraction.
- context — `complete` with `load_section` / `load_portfolio` tools for the
  portfolio assistant (feature `context.assistant`).

## Follow-ups

- Real generation is only exercisable with `OPENROUTER_API_KEY` set (tests use
  the VITEST stub). Smoke-test live once a key is wired.
