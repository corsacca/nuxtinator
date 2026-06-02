import type { Nuxt } from '@nuxt/schema'

// Register one or more `#alias` → absolute-path mappings on BOTH the Vite/runtime
// alias table and Nitro's tsconfig paths, so client and server type resolution
// agree. Extracted from the kernel/alias modules (core's tenant-kernel +
// email-kernel, tenancy's tenant-kernel, email-mailgun's alias) which each
// hand-rolled this identical ladder — drift here fails only at server typecheck.
//
// Callers keep their own register-if-unset guard (e.g.
// `if (nuxt.options.alias['#tenant']) return`) before calling.
export function defineAlias(nuxt: Nuxt, aliases: Record<string, string>): void {
  const pathRecord: Record<string, string[]> = {}
  for (const [name, target] of Object.entries(aliases)) {
    nuxt.options.alias[name] = target
    pathRecord[name] = [target]
  }

  // Mirror into Nitro's tsconfig paths so server-side type resolution works.
  nuxt.options.nitro = nuxt.options.nitro || {}
  const ts = nuxt.options.nitro.typescript = nuxt.options.nitro.typescript || {}
  const tsConfig = ts.tsConfig = ts.tsConfig || {}
  const compilerOptions = tsConfig.compilerOptions = tsConfig.compilerOptions || {}
  const paths = compilerOptions.paths = compilerOptions.paths || {}
  Object.assign(paths, pathRecord)
}
