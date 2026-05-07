import type { H3Event } from 'h3'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import { getUserPermissions } from '#core/server/utils/rbac'
import type { Permission } from '#core/app/utils/permissions'
// Cross-layer type import to the OAuth layer; see mcp-origin.ts for why we
// use the `#oauth/*` aliases declared in the OAuth layer's nuxt.config.ts
// instead of `~~/...` or `#imports`.
import type { BearerAuth } from '#oauth/bearer'

import type { McpAuthorizationError, McpToolContext, McpToolDef } from './define'
import type { RegisteredTool } from './registry'
import { getRegistry } from './registry'
import { mcpError } from './errors'
import { validateInput } from '../utils/mcp-validate'
import { checkBuckets } from '../utils/mcp-rate-limit'

interface BuildOpts {
  auth: BearerAuth
  event: H3Event
}

function authzError(payload: McpAuthorizationError, text: string): {
  content: Array<{ type: 'text'; text: string }>
  structuredContent: McpAuthorizationError
  isError: true
} {
  return {
    content: [{ type: 'text', text }],
    structuredContent: payload,
    isError: true
  }
}

function listVisibleTools(
  scopeSet: ReadonlySet<string>,
  userPerms: ReadonlySet<Permission>,
  tools: ReadonlyArray<RegisteredTool>
): RegisteredTool[] {
  const out: RegisteredTool[] = []
  for (const entry of tools) {
    if (!scopeSet.has(entry.def.scope)) continue
    if (!userPerms.has(entry.def.scope as Permission)) continue
    out.push(entry)
  }
  return out
}

export async function buildMcpServer(opts: BuildOpts): Promise<Server> {
  const { auth, event } = opts
  const cfg = useRuntimeConfig()
  // Use the module-level singleton directly. The 00-mcp-init plugin also
  // points `nitroApp.mcpRegistry` at this same instance for the public
  // consumer API surface, but we don't depend on plugin-load order here.
  const registry = getRegistry()

  const serverName = (cfg.mcpServerName as string) || 'mcp-server'
  const serverVersion = (cfg.mcpServerVersion as string) || '1.0.0'

  const userPermissions = await getUserPermissions(auth.userId)
  const dispatchCtx = { auth, event, userPermissions }

  const server = new Server(
    {
      name: serverName,
      version: serverVersion
    },
    {
      capabilities: {
        tools: { listChanged: false },
        ...(registry.resources.length > 0 ? { resources: { listChanged: false } } : {})
      }
    }
  )

  // ── tools/list ─────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const scopeSet = new Set<string>(auth.scopes)
    const visible = listVisibleTools(scopeSet, userPermissions, registry.tools)
    return {
      tools: visible.map((entry) => {
        const tool: Record<string, unknown> = {
          name: entry.def.name,
          description: entry.def.description,
          inputSchema: entry.inputJsonSchema
        }
        if (entry.outputJsonSchema) {
          tool.outputSchema = entry.outputJsonSchema
        }
        return tool
      })
    }
  })

  // ── tools/call ─────────────────────────────────────────────────────────
  // The SDK's setRequestHandler expects a return that's a wider Zod-inferred
  // shape than the spec-shaped object literals we return. The handler
  // *behavior* is correct (verified end-to-end in the integration suite);
  // the cast here is a pure TS-side variance fix. Re-narrow if/when the SDK
  // exports a less restrictive return type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(server as any).setRequestHandler(CallToolRequestSchema, async (req: { params: { name: string; arguments?: Record<string, unknown> } }) => {
    const name = req.params.name
    const entry = registry.tools.find((t: { def: McpToolDef }) => t.def.name === name)
    if (!entry) {
      return {
        content: [{ type: 'text', text: `Tool not found: ${name}` }],
        isError: true
      }
    }
    const tool = entry.def

    // Gate 2: scope on token
    if (!auth.scopes.includes(tool.scope)) {
      return authzError(
        {
          error: 'insufficient_scope',
          required: tool.scope,
          surface: 'token',
          actionable: 're_authorize'
        },
        `Insufficient scope. This tool requires '${tool.scope}'; your token does not include it.`
      )
    }

    // Gate 3: RBAC permission
    if (!userPermissions.has(tool.scope as Permission)) {
      return authzError(
        {
          error: 'insufficient_permission',
          required: tool.scope,
          surface: 'rbac',
          actionable: 'contact_admin'
        },
        `Insufficient permission. This tool requires '${tool.scope}'; your account does not currently have it.`
      )
    }

    const toolCtx: McpToolContext = { ...dispatchCtx, tool }

    // Rate-limit buckets (default + per-tool).
    const limited = await checkBuckets(tool, toolCtx)
    if (limited) {
      const windowDesc = limited.windowMs >= 60_000
        ? `${Math.round(limited.windowMs / 60_000)}m`
        : `${Math.round(limited.windowMs / 1000)}s`
      return {
        content: [{
          type: 'text',
          text: `Rate limit exceeded: ${limited.bucket} (${limited.count}/${limited.limit} in ${windowDesc}). Retry after ${limited.retryAfterSeconds}s.`
        }],
        isError: true
      }
    }

    try {
      const parsedInput = await validateInput(req.params.arguments ?? {}, tool.input)
      const result = await tool.handler(parsedInput, toolCtx)

      // Server-side output validation when the tool declared an output schema.
      if (tool.output && result.structuredContent !== undefined) {
        const out = await tool.output.safeParseAsync(result.structuredContent)
        if (!out.success) {
          console.error('[mcp-layer] mcp.handler_output_invalid', {
            tool: tool.name,
            issues: out.error.issues
          })
          return {
            content: [{ type: 'text', text: 'tool returned malformed output' }],
            isError: true
          }
        }
      }

      return result
    }
    catch (err) {
      return mcpError(err)
    }
  })

  // ── resources/list ─────────────────────────────────────────────────────
  if (registry.resources.length > 0) {
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const scopeSet = new Set<string>(auth.scopes)
      const out: Array<{ uri: string; name?: string; description?: string; mimeType?: string }> = []
      const seen = new Set<string>()

      for (const entry of registry.resources) {
        const def = entry.def
        if (!scopeSet.has(def.scope)) continue
        if (!userPermissions.has(def.scope as Permission)) continue

        try {
          const items = await def.list({ ...dispatchCtx, resource: def })
          for (const item of items) {
            if (seen.has(item.uri)) continue
            seen.add(item.uri)
            out.push(item)
          }
        }
        catch (err) {
          console.error('[mcp-layer] resource list failed', { uriPattern: def.uriPattern, err })
        }
      }

      return { resources: out }
    })

    // Same TS-side variance cast as tools/call — the SDK's expected return
    // type is narrower than the spec-shaped literal we return.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(server as any).setRequestHandler(ReadResourceRequestSchema, async (req: { params: { uri: string } }) => {
      const uri = req.params.uri
      const scopeSet = new Set<string>(auth.scopes)

      for (const entry of registry.resources) {
        const def = entry.def
        if (!matchesUriPattern(uri, def.uriPattern)) continue
        if (!scopeSet.has(def.scope)) {
          throw new Error(`Insufficient scope. Resource requires '${def.scope}'.`)
        }
        if (!userPermissions.has(def.scope as Permission)) {
          throw new Error(`Insufficient permission. Resource requires '${def.scope}'.`)
        }
        return await def.read(uri, { ...dispatchCtx, resource: def })
      }

      throw new Error(`Resource not found: ${uri}`)
    })
  }

  return server
}

// Minimal `cms://page/{slug}/{locale}` pattern match. The pattern's static
// scheme + literal segments must match; placeholder segments (between { })
// match any single non-empty segment.
function matchesUriPattern(uri: string, pattern: string): boolean {
  const [pScheme, pRest] = splitScheme(pattern)
  const [uScheme, uRest] = splitScheme(uri)
  if (pScheme !== uScheme) return false
  const pSegs = pRest.split('/')
  const uSegs = uRest.split('/')
  if (pSegs.length !== uSegs.length) return false
  for (let i = 0; i < pSegs.length; i++) {
    const p = pSegs[i]
    const u = uSegs[i]
    if (p === undefined || u === undefined) return false
    if (p.startsWith('{') && p.endsWith('}')) {
      if (u.length === 0) return false
      continue
    }
    if (p !== u) return false
  }
  return true
}

function splitScheme(uri: string): [string, string] {
  const idx = uri.indexOf('://')
  if (idx === -1) return ['', uri]
  return [uri.slice(0, idx), uri.slice(idx + 3)]
}
