import { defineNuxtModule, createResolver } from '@nuxt/kit'

// Registers the `#email` alias to point at this layer's Mailgun implementation.
// Same pattern as `#tenant` — runs unconditionally; the host's fallback module
// only registers if no other layer has already done so.
export default defineNuxtModule({
  meta: { name: 'email-mailgun/alias' },
  setup(_, nuxt) {
    const resolver = createResolver(import.meta.url)
    const serverPath = resolver.resolve('../server/utils/email.ts')

    nuxt.options.alias['#email'] = serverPath

    nuxt.options.nitro = nuxt.options.nitro || {}
    const ts = nuxt.options.nitro.typescript = nuxt.options.nitro.typescript || {}
    const tsConfig = ts.tsConfig = ts.tsConfig || {}
    const compilerOptions = tsConfig.compilerOptions = tsConfig.compilerOptions || {}
    const paths = compilerOptions.paths = compilerOptions.paths || {}
    Object.assign(paths, { '#email': [serverPath] })
  }
})
