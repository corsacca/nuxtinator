// Origin helpers for the widget sign-in flow.
//
// Which sites may sign a user in for a project is controlled entirely by that
// project's `allowed_origins` column (edited in the project UI — runtime, no
// rebuild). There is no global env-var allowlist. CORS for the public widget
// API reflects the caller's origin (see server/middleware/feedback-cors.ts):
// it never allows credentials, so the real gates are this per-project allowlist
// for sign-in plus bearer tokens for authenticated reads.

const LOOPBACK_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

// Parse a URL and return its origin (scheme://host[:port]), or null if it isn't
// a valid absolute http(s) URL.
export function originOf(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.origin
  } catch {
    return null
  }
}

// True if `origin` may complete the sign-in redirect for a project with the
// given `allowed_origins`. Loopback is allowed outside production so local
// embedding works without configuration.
export function isRedirectOriginAllowed(origin: string, projectOrigins: string[]): boolean {
  if (process.env.NODE_ENV !== 'production' && LOOPBACK_RE.test(origin)) return true
  return projectOrigins.includes(origin)
}
