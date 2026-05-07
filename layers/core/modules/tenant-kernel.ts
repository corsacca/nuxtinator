import { defineNuxtModule, createResolver } from '@nuxt/kit'

// Registers the `#tenant` and `#tenant/server` aliases with the host's
// single-mode kernel — but ONLY if no other module (the tenancy layer) has
// already registered them. The tenancy layer's module runs first because
// layers in `extends:` initialize before the host project; this module then
// runs and yields to whatever it set.
//
// The single-mode kernel files live OUTSIDE `app/utils/` and
// `server/utils/` (in `tenant-kernel/`) deliberately — those directories
// are auto-scanned by Nuxt and would collide with the tenancy layer's
// same-named files. Aliases handle explicit imports; auto-imports come
// from the tenancy layer's `tenant.ts` files when loaded.
export default defineNuxtModule({
  meta: { name: 'tenant-kernel' },
  setup(_, nuxt) {
    if (nuxt.options.alias['#tenant']) return

    const resolver = createResolver(import.meta.url)
    const clientPath = resolver.resolve('../tenant-kernel/client.ts')
    const serverPath = resolver.resolve('../tenant-kernel/server.ts')

    nuxt.options.alias['#tenant'] = clientPath
    nuxt.options.alias['#tenant/server'] = serverPath

    // Mirror into Nitro's tsconfig paths so server-side type resolution works.
    nuxt.options.nitro = nuxt.options.nitro || {}
    const ts = nuxt.options.nitro.typescript = nuxt.options.nitro.typescript || {}
    const tsConfig = ts.tsConfig = ts.tsConfig || {}
    const compilerOptions = tsConfig.compilerOptions = tsConfig.compilerOptions || {}
    const paths = compilerOptions.paths = compilerOptions.paths || {}
    Object.assign(paths, {
      '#tenant': [clientPath],
      '#tenant/server': [serverPath]
    })
  }
})
