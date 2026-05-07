// Module augmentation so consuming-project code can read `nitroApp.mcpRegistry`
// with type safety. Picked up automatically when a project `extends` this layer.
import type { McpRegistry } from './server/mcp-layer/registry'

declare module 'nitropack' {
  interface NitroApp {
    mcpRegistry: McpRegistry
  }
}

declare module 'nitropack/types' {
  interface NitroApp {
    mcpRegistry: McpRegistry
  }
}

declare module 'nitropack/runtime' {
  interface NitroApp {
    mcpRegistry: McpRegistry
  }
}

export {}
