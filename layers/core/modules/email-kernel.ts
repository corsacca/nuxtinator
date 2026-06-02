import { defineNuxtModule, createResolver } from '@nuxt/kit'
import { defineAlias } from '../kit/alias'

// Registers `#email` as a no-op fallback only if no other module (an
// email-* layer) has already set it. Same pattern as `modules/tenant-kernel.ts`.
export default defineNuxtModule({
  meta: { name: 'email-kernel' },
  setup(_, nuxt) {
    if (nuxt.options.alias['#email']) return

    const resolver = createResolver(import.meta.url)
    const fallbackPath = resolver.resolve('../email-fallback/email.ts')

    defineAlias(nuxt, { '#email': fallbackPath })
  }
})
