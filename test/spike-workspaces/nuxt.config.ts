import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

declare const process: { env: Record<string, string | undefined> }

const LAYERS_DIR = '_layers'

// Layers extracted from a full Nuxt project ship a tsconfig.json that
// references generated paths; Vite's tsconfig walker inspects .layers/
// and crashes if these aren't stripped first.
function stripLayerTsconfigs() {
  if (!existsSync(LAYERS_DIR)) return
  for (const name of readdirSync(LAYERS_DIR)) {
    const t = join(LAYERS_DIR, name, 'tsconfig.json')
    if (existsSync(t)) rmSync(t)
  }
}
stripLayerTsconfigs()

export default defineNuxtConfig({
  extends: [
    '_layers/core',
    '_layers/email-mailgun'
  ],
  hooks: { 'modules:before': stripLayerTsconfigs },
  ssr: false,
  compatibilityDate: '2025-01-15',

  // Each .layers/<id>/ should NOT have a node_modules under this recipe
  // (workspaces hoist), but ignore them defensively in case of stragglers.
  vite: {
    server: {
      watch: {
        ignored: ['**/_layers/*/node_modules/**', '**/node_modules/**']
      }
    }
  }
})
