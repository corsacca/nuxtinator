import { defineNuxtModule, createResolver } from '@nuxt/kit'

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

    nuxt.options.alias['#tenant'] = clientPath
    nuxt.options.alias['#tenant/server'] = serverPath

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
