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
    }
  }
})
