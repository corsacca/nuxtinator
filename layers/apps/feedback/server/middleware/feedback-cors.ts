import {
  getRequestURL,
  getHeader,
  isPreflightRequest,
  appendCorsHeaders,
  appendCorsPreflightHeaders,
  setResponseStatus
} from 'h3'
import type { H3CorsOptions } from 'h3'

// CORS for the public widget API consumed by cross-origin embeds. The caller's
// origin is reflected back (never `*`-with-credentials): the widget
// authenticates cross-origin with a bearer token, never cookies, so credentials
// are intentionally NOT allowed. Access is gated where it matters — sign-in by
// each project's `allowed_origins`, and authenticated reads by bearer token —
// not by CORS, which a non-browser client ignores anyway. Same-origin requests
// carry no Origin header and pass straight through.
const CORS_PREFIXES = ['/api/v1/feedback', '/api/v1/project']

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  if (!CORS_PREFIXES.some(p => path === p || path.startsWith(p + '/'))) return

  const origin = getHeader(event, 'origin')
  if (!origin) return

  const corsOptions: H3CorsOptions = {
    origin: [origin],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
    maxAge: '600'
  }

  if (isPreflightRequest(event)) {
    appendCorsPreflightHeaders(event, corsOptions)
    setResponseStatus(event, 204)
    return ''
  }

  appendCorsHeaders(event, corsOptions)
})
