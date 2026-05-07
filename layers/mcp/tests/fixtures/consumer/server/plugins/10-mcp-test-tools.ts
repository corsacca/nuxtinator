// Registers the test fixture's MCP tools with the registry. Order across
// layers isn't strictly defined, so we go through the module-level
// singleton (`getRegistry()`) rather than `nitroApp.mcpRegistry` to avoid
// a flaky undefined-on-cold-start.
import { getRegistry } from '#mcp-layer'
import {
  listPagesTool,
  createPageTool,
  deletePageTool,
  outputCheckTool,
  expensiveTool,
  failingTool
} from '../mcp-tools/all'

export default defineNitroPlugin(() => {
  const registry = getRegistry()
  registry.register(listPagesTool)
  registry.register(createPageTool)
  registry.register(deletePageTool)
  registry.register(outputCheckTool)
  registry.register(expensiveTool)
  registry.register(failingTool)
})
