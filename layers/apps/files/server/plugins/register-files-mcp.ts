// Registers the files layer's MCP tools with the MCP-layer registry.
// Runs after `00-mcp-init.ts` (which initializes the registry).
//
// Re-registers the files permissions defensively before registering tools.
// The MCP registry's scope validator only accepts scopes that are in the
// runtime permission registry, and Nitro's alphabetic plugin order would
// otherwise load this file *before* `register-files.ts` (the dash in
// `register-files-mcp` sorts before the dot in `register-files`).
// `registerPermissions` is idempotent — calling it twice is harmless.
//
// Note: the files layer assumes the MCP layer is loaded. If a downstream
// consumer omits MCP, comment out this plugin (and `server/mcp/`) along with
// removing the MCP entry from `extends:`.

import { getRegistry, type McpToolDef } from '#mcp-layer'
import { registerPermissions } from '#core/server/utils/permissions-registry'
import { filesMcpTools } from '../mcp/files-tools'
import { FILES_PERMISSIONS, FILES_PERMISSION_META } from '../../app/utils/permissions'

export default defineNitroPlugin(() => {
  registerPermissions(FILES_PERMISSIONS, FILES_PERMISSION_META)

  const registry = getRegistry()
  for (const tool of filesMcpTools) {
    registry.register(tool as McpToolDef<unknown, unknown>)
  }
})
