// Registers the feedback layer's MCP tools with the MCP-layer registry.
//
// Re-registers the feedback permissions defensively before registering tools.
// The MCP registry's scope validator only accepts scopes that are in the
// runtime permission registry, and Nitro's alphabetic plugin order would
// otherwise load this file *before* `register-feedback.ts` (the dash in
// `register-feedback-mcp` sorts before the dot in `register-feedback`).
// `registerPermissions` is idempotent — calling it twice is harmless.
//
// Note: this plugin assumes the MCP layer is loaded. If a downstream consumer
// omits MCP, comment out this plugin (and `server/mcp/`) along with removing
// the MCP entry from `extends:`.

import { getRegistry, type McpToolDef } from '#mcp-layer'
import { registerPermissions } from '#core/server/utils/permissions-registry'
import { feedbackMcpTools } from '../mcp/feedback-tools'
import { FEEDBACK_PERMISSIONS, FEEDBACK_PERMISSION_META } from '../../app/utils/permissions'

export default defineNitroPlugin(() => {
  registerPermissions(FEEDBACK_PERMISSIONS, FEEDBACK_PERMISSION_META)

  const registry = getRegistry()
  for (const tool of feedbackMcpTools) {
    registry.register(tool as McpToolDef<unknown, unknown>)
  }
})
