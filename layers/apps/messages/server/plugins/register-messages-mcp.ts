// Registers the messages layer's MCP tools with the MCP-layer registry.
// Runs after `00-mcp-init.ts` (which initializes the registry).
//
// Re-registers the messages permissions defensively before registering tools.
// The MCP registry's scope validator only accepts scopes that are in the
// runtime permission registry, and Nitro's alphabetic plugin order would
// otherwise load this file *before* `register-messages.ts` (the dash in
// `register-messages-mcp` sorts before the dot in `register-messages`).
// `registerPermissions` is idempotent — calling it twice is harmless.
//
// Note: the messages layer assumes the MCP layer is loaded. If a downstream
// consumer omits MCP, comment out this plugin (and `server/mcp/`) along with
// removing the MCP entry from `extends:`.

import { getRegistry, type McpToolDef } from '#mcp-layer'
import { registerPermissions } from '#core/server/utils/permissions-registry'
import { messagesMcpTools } from '../mcp/messages-tools'
import {
  MESSAGES_PERMISSIONS,
  MESSAGES_PERMISSION_META
} from '../../app/utils/permissions'

export default defineNitroPlugin(() => {
  registerPermissions(MESSAGES_PERMISSIONS, MESSAGES_PERMISSION_META)

  const registry = getRegistry()
  for (const tool of messagesMcpTools) {
    // The array's element type is a union of McpToolDef<I_n, O_n> across the
    // tools' input/output schemas; `register<I, O>` can't unify across the
    // union, so we pass each tool through a wide McpToolDef cast.
    registry.register(tool as McpToolDef<unknown, unknown>)
  }
})
