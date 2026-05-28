// Register the context layer's MCP tools with the MCP-layer registry.
// Runs after `00-mcp-init.ts` (which initializes the registry).
//
// Re-registers context permissions defensively before registering tools.
// The MCP registry's scope validator only accepts scopes in the runtime
// permission registry, and Nitro's alphabetic plugin order would otherwise
// load this file before `register-context.ts` (the dash in
// `register-context-mcp` sorts before the dot in `register-context`).
// `registerPermissions` is idempotent — calling it twice is harmless.

import { getRegistry, type McpToolDef } from '#mcp-layer'
import { registerPermissions } from '#core/server/utils/permissions-registry'
import { contextMcpTools } from '../mcp/context-tools'
import {
  CONTEXT_PERMISSIONS,
  CONTEXT_PERMISSION_META
} from '../../app/utils/permissions'

export default defineNitroPlugin(() => {
  registerPermissions(CONTEXT_PERMISSIONS, CONTEXT_PERMISSION_META)

  const registry = getRegistry()
  for (const tool of contextMcpTools) {
    registry.register(tool as McpToolDef<unknown, unknown>)
  }
})
