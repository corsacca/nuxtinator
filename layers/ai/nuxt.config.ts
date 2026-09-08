// AI layer — a shared, optional AI backend any layer can consume, backed by
// OpenRouter's OpenAI-compatible chat-completions API (many models, one API).
//
// Aliases (registered unconditionally by modules/ai-alias.ts so they win over
// core's fallback):
//   #ai/server — generation (complete/generate with forced tool-calls), the
//                live model list, org/host key + model resolution, and the
//                feature registry, for consumer layers (inbox, context, …).
//   #ai        — client-side shared types for the admin and org AI pages.
//
// Core ships a throwing `#ai/server` fallback so consumers can import
// unconditionally and gate on `isAiConfigured(tx)` when the layer or key is
// absent. OpenRouter is called with plain fetch (OpenAI-compatible) — no SDK,
// so none of the `@anthropic-ai/sdk` bundling caveats apply.
//
// Keys: each org may store its own OpenRouter key (encrypted with core's
// NUXT_SECRET_ENCRYPTION_KEY) on its settings page; the env key below is the
// host-wide fallback for orgs without one.
//
// Host fallback key (optional — orgs with their own key never use it):
//   OPENROUTER_API_KEY
// Optional:
//   OPENROUTER_BASE_URL  (default https://openrouter.ai/api/v1)
//   AI_HTTP_REFERER      (OpenRouter attribution header)
//   AI_APP_TITLE         (OpenRouter attribution header)
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: [
    fileURLToPath(new URL('./modules/ai-alias.ts', import.meta.url))
  ],

  runtimeConfig: {
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    aiHttpReferer: process.env.AI_HTTP_REFERER || '',
    aiAppTitle: process.env.AI_APP_TITLE || ''
  }
})
