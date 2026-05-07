import { defineNuxtModule, createResolver } from '@nuxt/kit'

// Registers `#email` as a no-op fallback only if no other module (an
// email-* layer) has already set it. Same pattern as `modules/tenant-kernel.ts`.
export default defineNuxtModule({
  meta: { name: 'email-kernel' },
  setup(_, nuxt) {
    if (nuxt.options.alias['#email']) return

    const resolver = createResolver(import.meta.url)
    const fallbackPath = resolver.resolve('../email-fallback/email.ts')

    nuxt.options.alias['#email'] = fallbackPath

    nuxt.options.nitro = nuxt.options.nitro || {}
    const ts = nuxt.options.nitro.typescript = nuxt.options.nitro.typescript || {}
    const tsConfig = ts.tsConfig = ts.tsConfig || {}
    const compilerOptions = tsConfig.compilerOptions = tsConfig.compilerOptions || {}
    const paths = compilerOptions.paths = compilerOptions.paths || {}
    Object.assign(paths, { '#email': [fallbackPath] })
  }
})
