import { defineNuxtModule } from '@nuxt/kit'
import path from 'path'
import { existsSync } from 'fs'

export default defineNuxtModule({
  meta: { name: 'migrations' },
  setup(_, nuxt) {
    nuxt.options.runtimeConfig.layerMigrationPaths = nuxt.options._layers
      .map(l => path.join(l.cwd, 'migrations'))
      .filter(p => existsSync(p) && p !== path.join(nuxt.options.rootDir, 'migrations'))
  }
})
