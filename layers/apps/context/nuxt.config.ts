// Context layer — portfolios of markdown sections, suggestions, the portfolio
// assistant, and MCP tools.
//
// Alias (registered by modules/context-alias.ts):
//   #context/server — the public, semver-covered server API for consumer
//                     layers: portfolios, sections, suggestions, templates.
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: [
    fileURLToPath(new URL('./modules/context-alias.ts', import.meta.url))
  ]
})
