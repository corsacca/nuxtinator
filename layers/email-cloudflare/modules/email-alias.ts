import { defineNuxtModule, createResolver } from '@nuxt/kit'
import { defineAlias } from '@nuxtinator/core/kit'

// Registers the `#email` alias to point at this layer's Cloudflare implementation.
// Same pattern as `#tenant` — runs unconditionally; the host's fallback module
// only registers if no other layer has already done so.
export default defineNuxtModule({
  meta: { name: 'email-cloudflare/alias' },
  setup(_, nuxt) {
    const resolver = createResolver(import.meta.url)
    const serverPath = resolver.resolve('../server/utils/email.ts')

    defineAlias(nuxt, { '#email': serverPath })
  }
})
