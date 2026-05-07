// Per-resource OAuth Protected Resource metadata (RFC 9728 §3.1).
//
// When a resource identifier carries a path component (e.g.
// `https://example.com/mcp`), clients fetch the metadata at
// `${origin}/.well-known/oauth-protected-resource/<path>` rather than
// the path-less form. MCP 2025-06-18+ clients use this path-specific
// form when discovering an MCP resource at `${issuer}/mcp`.
//
// We validate that the requested `<path>` matches the configured
// mcpResource's path before returning the metadata — a 404 here
// stops information leakage about the underlying app surface.

import { getOauthConfig } from '../../../utils/oauth-config'
import { getAdvertisedScopes } from '../../../utils/oauth-validation'

export default defineEventHandler((event) => {
  const cfg = getOauthConfig()

  let resourcePath: string
  try {
    resourcePath = new URL(cfg.mcpResource).pathname.replace(/^\/+|\/+$/g, '')
  }
  catch {
    throw createError({ statusCode: 500, statusMessage: 'mcpResource not configured' })
  }

  const requestedRaw = getRouterParam(event, 'path') ?? ''
  const requested = String(requestedRaw).replace(/^\/+|\/+$/g, '')

  // Reject mismatches with a 404 — clients must request the exact
  // path that maps to the advertised resource.
  if (requested !== resourcePath) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  return {
    resource: cfg.mcpResource,
    authorization_servers: [cfg.issuer],
    scopes_supported: getAdvertisedScopes(),
    bearer_methods_supported: ['header']
  }
})
