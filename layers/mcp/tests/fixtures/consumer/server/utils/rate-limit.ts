// Fixture stub for the consumer's HTTP rate-limit util that the OAuth
// layer's authorize/token routes invoke. Tests don't exercise the OAuth
// authorize flow (we mint tokens directly via the harness), so this stub
// always allows.
export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds?: number
}

export async function checkRateLimit(
  _action: string,
  _scope: string,
  _key: string,
  _windowMs: number,
  _limit: number
): Promise<RateLimitResult> {
  return { allowed: true }
}

export function logRateLimitExceeded(
  _key: string,
  _route: string,
  _userAgent?: string
): void {
  // no-op in fixture
}
