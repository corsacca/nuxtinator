export default defineNuxtConfig({
  nitro: {
    // The default @anthropic-ai/sdk entry imports `_shims/auto/runtime`, which
    // depends on the package's conditional `exports` wildcard resolving to
    // `_shims/auto/runtime-{bun,node}.mjs`. Nitro's file-tracer doesn't follow
    // that wildcard, so the runtime files don't land in `.output/server/`,
    // and Bun throws `Cannot find module '.../auto/runtime'` at first call.
    // Bundling the SDK has Rollup resolve the conditional at build time and
    // inline the right runtime, sidestepping the trace + conditional miss.
    externals: {
      inline: ['@anthropic-ai/sdk']
    },
    rollupConfig: {
      // @anthropic-ai/sdk (and its inlined transitive deps, e.g. formdata-node)
      // ship transpiled .mjs files whose top-level TS helpers reference `this`
      // (undefined in ESM). Inlining the SDK (above) makes Rollup parse them and
      // emit a cosmetic THIS_IS_UNDEFINED warning. The rewrite is correct and
      // harmless; drop it for third-party code, but still warn for our own.
      onwarn(warning, defaultHandler) {
        if (
          warning.code === 'THIS_IS_UNDEFINED'
          && warning.id?.includes('node_modules')
        ) {
          return
        }
        // Preserve Nitro's own defaults (it suppresses these two by default).
        if (warning.code === 'CIRCULAR_DEPENDENCY' || warning.code === 'EVAL') {
          return
        }
        defaultHandler(warning)
      }
    }
  }
})
