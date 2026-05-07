import type { H3Event } from 'h3'
// Cross-layer import to the OAuth layer via the `#oauth/*` aliases that the
// OAuth layer declares in its own nuxt.config.ts. We use those aliases
// instead of `~~/...` or `#imports` because:
//   - `~~/...` resolves only to the consumer-project root in tsconfig paths,
//     not to layer trees, so OAuth-layer files aren't reachable that way at
//     typecheck time.
//   - `#imports` re-exports OAuth-layer values, but TypeScript's bundler
//     resolution doesn't trace exports through the absolute paths in the
//     generated nitro-imports.d.ts when imported from layer files.
// `#oauth/*` is a plain file-path alias (analogous to MCP's own `#mcp-layer`
// alias) and resolves to the OAuth layer wherever the consumer placed it,
// which means the layers don't need to be on-disk siblings. When a consumer
// extends both layers, Nuxt merges the OAuth layer's `alias` and tsconfig
// `paths` entries into the consumer's resolution.
import { getOauthConfig } from '#oauth/config'

// MCP spec recommends Origin validation on HTTP requests as defense against
// CSRF / DNS rebinding. CORS governs what browsers *expose*, not what reaches
// the handler — independent defense.
//
// Allow rules (in order):
//   1. Origin absent → allow (non-browser clients including Claude Desktop send no Origin).
//   2. Origin matches the protected resource's origin → allow.
//   3. Dev: Origin is http://localhost:* or http://127.0.0.1:* and NODE_ENV !== 'production' → allow.
//   4. Origin is in runtimeConfig.mcpAdditionalOrigins → allow.
//   5. Otherwise → 403.
export function assertAllowedOrigin(event: H3Event): void {
  const origin = getHeader(event, 'origin')
  if (!origin) return

  const cfg = getOauthConfig()
  let resourceOrigin: string
  try {
    resourceOrigin = new URL(cfg.mcpResource).origin
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'mcpResource not configured' })
  }
  if (origin === resourceOrigin) return

  if (process.env.NODE_ENV !== 'production') {
    try {
      const url = new URL(origin)
      if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')) {
        return
      }
    } catch {
      // fall through
    }
  }

  const additional = (useRuntimeConfig().mcpAdditionalOrigins as string[] | undefined) ?? []
  if (additional.includes(origin)) return

  console.warn('[mcp-layer] origin_rejected', { origin, allowed: resourceOrigin })
  throw createError({
    statusCode: 403,
    statusMessage: 'Forbidden',
    data: { error: 'origin_not_allowed' }
  })
}
