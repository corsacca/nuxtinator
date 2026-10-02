import type { H3Event } from 'h3'
import { getRequestHeader } from 'h3'

// The client's IP for rate limiting. X-Forwarded-For's FIRST entry is
// whatever the client sent, so keying on it lets anyone pick a fresh
// identity per request. Each proxy appends the address it saw, so with N
// trusted proxies (runtimeConfig.trustedProxyHops) the N-th entry from the
// right is the last one written by infrastructure we trust. With no header,
// or 0 hops, the socket address is used.
export function getClientIp(event: H3Event): string {
  const socketIp = event.node.req.socket?.remoteAddress || 'unknown'
  const hops = Number(useRuntimeConfig().trustedProxyHops ?? 1)
  if (!Number.isFinite(hops) || hops <= 0) return socketIp
  const header = getRequestHeader(event, 'x-forwarded-for')
  if (!header) return socketIp
  const entries = header.split(',').map(s => s.trim()).filter(Boolean)
  if (entries.length === 0) return socketIp
  return entries[Math.max(0, entries.length - hops)]!
}
