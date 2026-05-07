// Public surface of the MCP layer. Consumer projects (and downstream layers)
// import from `#mcp-layer` and never reach into the layer's internal directory.

export {
  defineMcpTool,
  defineMcpResource
} from './define'

export type {
  McpToolDef,
  McpToolContext,
  McpToolResult,
  McpToolRateLimit,
  McpResourceDef,
  McpResourceContext,
  McpResourceListItem,
  McpResourceReadResult,
  McpResourceReadContent,
  McpDispatchContext,
  McpAuthorizationError,
  BearerAuth
} from './define'

export type { McpRegistry } from './registry'

// Module-level singleton accessor. Use this instead of `nitroApp.mcpRegistry`
// when you need to call `register(...)` from a Nitro plugin in a layer
// whose load order relative to the MCP layer's `00-mcp-init` plugin is
// not guaranteed (cross-layer plugin ordering in Nuxt isn't strictly
// defined). Both surfaces back the same registry instance.
export { getRegistry } from './registry'

export { mcpLog, mcpLogWriteRejected } from '../utils/mcp-audit'
export { validateInput } from '../utils/mcp-validate'
export { mcpError } from './errors'

// Rate-limit override surface for consumer projects.
export type { McpRateLimitConfig, BucketSpec } from '../utils/mcp-rate-limit-types'
