// Pure-types surface for the rate-limit config. No imports from layer
// internals — keeping this file leaf-shaped means consumer-side code that's
// type-checked under tsconfig.node.json (which lacks the `~~/*` path mapping)
// can import these types without TS following a chain that touches
// `~~/app/utils/permissions`.

export interface BucketSpec {
  limit: number
  windowMs: number
}

export interface BucketResult {
  allowed: boolean
  count: number
  limit: number
  windowMs: number
  retryAfterSeconds: number
  bucket: string
}

export interface McpRateLimitConfig {
  allToolsPerToken?: BucketSpec | null
  writesPerToken?: BucketSpec | null
  destructivePerUser?: BucketSpec | null
}
