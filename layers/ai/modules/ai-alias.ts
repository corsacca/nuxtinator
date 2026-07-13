import { defineNuxtModule, createResolver } from '@nuxt/kit'
import { defineAlias } from '@nuxtinator/core/kit'

// Registers `#ai/server` (generation + model resolution) and `#ai` (client
// shared types) to point at this layer's real implementation. Runs
// unconditionally; core's ai-kernel fallback only registers `#ai/server` when no
// layer has. Same pattern as email-mailgun/modules/email-alias.ts.
export default defineNuxtModule({
  meta: { name: 'ai/alias' },
  setup(_, nuxt) {
    const resolver = createResolver(import.meta.url)

    defineAlias(nuxt, {
      '#ai/server': resolver.resolve('../server/exports/index.ts'),
      '#ai': resolver.resolve('../app/utils/ai-manifest.ts')
    })
  }
})
