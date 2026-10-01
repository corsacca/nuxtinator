// Registers the `#context/server` alias: the public server API for consumer layers.
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: [
    fileURLToPath(new URL('./modules/context-alias.ts', import.meta.url))
  ]
})
