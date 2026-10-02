export default defineNuxtConfig({
  runtimeConfig: {
    // The section vector index needs pgvector. Without it core's migration
    // runner holds back these two migrations and the layer runs unindexed.
    migrationRequiredExtensions: { context_013: ['vector'], context_T013: ['vector'] }
  }
})
