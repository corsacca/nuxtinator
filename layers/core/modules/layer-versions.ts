import { defineNuxtModule } from '@nuxt/kit'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Surface what this build was assembled from to the runtime, so the in-app
// "Updates" page (server/utils/layer-updates.ts) can report — in one place, no
// build-log digging:
//   - which installed layers have newer releases available (from layers.lock.json)
//   - which loaded layers declare a @nuxtinator/core range the installed core
//     doesn't satisfy (from each layer's own package.json)
//
// Everything is read once at build time (reliable filesystem access); the
// runtime only does the network tag lookup. In the maintainer dev host there's
// no lock, so the updates list is empty and this is effectively inert.
export default defineNuxtModule({
  meta: { name: 'layer-versions' },
  setup(_, nuxt) {
    // What this build is running (resolved versions + sources), from the host lock.
    const lockPath = path.join(nuxt.options.rootDir, 'layers.lock.json')
    let lock: Record<string, unknown> = {}
    if (existsSync(lockPath)) {
      try {
        lock = JSON.parse(readFileSync(lockPath, 'utf8'))
      } catch {
        lock = {} // a malformed lock shouldn't break the build; the page degrades to empty
      }
    }
    nuxt.options.runtimeConfig.layerLock = lock
    // Optional read-only token for listing tags of a PRIVATE layer source.
    nuxt.options.runtimeConfig.layerSourceToken = process.env.LAYER_SOURCE_TOKEN || ''

    // Compatibility inputs: core's installed version + each loaded layer's
    // declared @nuxtinator/core range (its optionalDependencies entry). The
    // runtime util compares them and the page badges any mismatch. "*" (today's
    // default for every layer) means "no constraint" — nothing to flag.
    const corePkgPath = fileURLToPath(new URL('../package.json', import.meta.url))
    nuxt.options.runtimeConfig.coreVersion = JSON.parse(readFileSync(corePkgPath, 'utf8')).version

    const compat: Record<string, string> = {} // package name -> declared @nuxtinator/core range
    for (const l of nuxt.options._layers) {
      const pkgPath = path.join(l.cwd, 'package.json')
      if (!existsSync(pkgPath)) continue
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
        const range = pkg.optionalDependencies?.['@nuxtinator/core']
        if (pkg.name && range) compat[pkg.name] = range
      } catch {
        // skip an unreadable package.json
      }
    }
    nuxt.options.runtimeConfig.layerCompat = compat
  }
})
