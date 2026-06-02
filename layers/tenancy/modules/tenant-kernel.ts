import { defineNuxtModule, createResolver } from '@nuxt/kit'
import { defineAlias } from '@nuxtinator/core/kit'

// The tenancy layer's `#tenant` registration. Runs before the host's
// `tenant-kernel` module (layers in `extends:` initialize before the host).
// Sets the alias unconditionally; the host's module sees the alias is set
// and yields, so multi-mode wins when this layer is loaded.
export default defineNuxtModule({
  meta: { name: 'tenancy/tenant-kernel' },
  setup(_, nuxt) {
    const resolver = createResolver(import.meta.url)
    const clientPath = resolver.resolve('../app/utils/tenant.ts')
    const serverPath = resolver.resolve('../server/utils/tenant.ts')

    defineAlias(nuxt, {
      '#tenant': clientPath,
      '#tenant/server': serverPath
    })

    // Feature flag for code in core that conditionally exposes tenancy-only
    // data/endpoints (org-membership joins on /admin/users, /api/admin/orgs/*,
    // etc.). Set programmatically here so callers don't have to maintain it
    // in nuxt.config and can't override it via env vars — its value is fixed
    // by whether this layer is in `extends:`.
    nuxt.options.runtimeConfig.public = nuxt.options.runtimeConfig.public || {}
    ;(nuxt.options.runtimeConfig.public as Record<string, unknown>).tenancy = true
  }
})
