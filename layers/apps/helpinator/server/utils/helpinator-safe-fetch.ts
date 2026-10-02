// Outbound fetches for the crawler. Source URLs come from org admins (in
// multi-tenant mode, customers), so a plain fetch would let them read
// loopback, private-network and cloud-metadata addresses through the stored
// pages. Every hop here resolves the host and refuses non-public addresses;
// redirects are followed by hand so each target is checked too; bodies are
// read as a stream and cut off at a byte cap.
//
// Residual risk: the address is checked at lookup, and fetch resolves again
// to connect, so a DNS-rebinding host with a near-zero TTL could still slip
// through between the two. Closing that needs a connect-time lookup hook,
// which Bun's fetch doesn't offer.
//
// `HELPINATOR_CRAWL_ALLOW_PRIVATE=true` lifts the check (local development
// against a site on your own machine). Under VITEST loopback is allowed so the
// suite's in-process fixture site works; every other private range stays
// blocked there too.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const MAX_REDIRECTS = 5

export class HelpinatorBlockedUrl extends Error {}

function ipv4Octets(ip: string): number[] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const nums = parts.map(Number)
  return nums.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ? nums : null
}

function isLoopback(ip: string): boolean {
  const v4 = ipv4Octets(ip)
  if (v4) return v4[0] === 127
  return ip.toLowerCase() === '::1'
}

function publicV4(o: number[]): boolean {
  const [a, b, c] = o as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127) return false // this-network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false // CGNAT
  if (a === 169 && b === 254) return false // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false // IETF, TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return false // 6to4 relay
  if (a === 198 && (b === 18 || b === 19)) return false // benchmarking
  if (a === 198 && b === 51 && c === 100) return false // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false // TEST-NET-3
  if (a >= 224) return false // multicast, reserved, broadcast
  return true
}

// Expand an IPv6 address to its eight 16-bit groups.
function ipv6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0]!
  // A trailing dotted IPv4 (::ffff:1.2.3.4) becomes two groups.
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (tail) {
    const o = ipv4Octets(tail[1]!)
    if (!o) return null
    s = s.slice(0, -tail[1]!.length) + `${((o[0]! << 8) | o[1]!).toString(16)}:${((o[2]! << 8) | o[3]!).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0
  if (fill < 0) return null
  const groups = [...head, ...Array<string>(fill).fill('0'), ...rest].map(g => Number.parseInt(g, 16))
  return groups.length === 8 && groups.every(g => Number.isInteger(g) && g >= 0 && g <= 0xFFFF) ? groups : null
}

function publicV6(g: number[]): boolean {
  const embeddedV4 = (hi: number, lo: number) => [hi >> 8, hi & 0xFF, lo >> 8, lo & 0xFF]
  if (g.every(x => x === 0)) return false // ::
  if (g.slice(0, 7).every(x => x === 0) && g[7] === 1) return false // ::1
  // IPv4-mapped / -compatible (::ffff:a.b.c.d, ::a.b.c.d): judge the IPv4.
  if (g.slice(0, 5).every(x => x === 0) && (g[5] === 0xFFFF || g[5] === 0)) return publicV4(embeddedV4(g[6]!, g[7]!))
  if (g[0] === 0x64 && g[1] === 0xFF9B) return publicV4(embeddedV4(g[6]!, g[7]!)) // NAT64
  if (g[0] === 0x2002) return publicV4(embeddedV4(g[1]!, g[2]!)) // 6to4
  if ((g[0]! & 0xFE00) === 0xFC00) return false // unique local
  if ((g[0]! & 0xFFC0) === 0xFE80) return false // link-local
  if ((g[0]! & 0xFF00) === 0xFF00) return false // multicast
  if (g[0] === 0x2001 && g[1] === 0xDB8) return false // documentation
  return true
}

// Whether `ip` is a globally routable unicast address. Pure — exported for tests.
export function helpinatorIsPublicAddress(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) {
    const o = ipv4Octets(ip)
    return !!o && publicV4(o)
  }
  if (kind === 6) {
    const g = ipv6Groups(ip)
    return !!g && publicV6(g)
  }
  return false
}

function allowPrivate(): boolean {
  return process.env.HELPINATOR_CRAWL_ALLOW_PRIVATE === 'true'
}

function addressAllowed(ip: string): boolean {
  if (allowPrivate()) return true
  if (process.env.VITEST && isLoopback(ip)) return true
  return helpinatorIsPublicAddress(ip)
}

function bareHost(u: URL): string {
  return u.hostname.replace(/^\[|\]$/g, '')
}

// Synchronous pre-check for admin input: rejects hosts that are obviously
// internal (IP literals in private ranges, localhost) before anything is
// stored. Hostnames are only fully checked at fetch time.
export function helpinatorUrlLooksPublic(raw: string): boolean {
  if (allowPrivate()) return true
  try {
    const u = new URL(raw)
    const host = bareHost(u).toLowerCase()
    if (isIP(host)) return addressAllowed(host)
    if (host === 'localhost' || host.endsWith('.localhost')) return !!process.env.VITEST
    return true
  } catch {
    return false
  }
}

async function assertPublicUrl(u: URL): Promise<void> {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new HelpinatorBlockedUrl('Only http(s) URLs can be crawled')
  const host = bareHost(u)
  let addresses: string[]
  if (isIP(host)) {
    addresses = [host]
  } else {
    try {
      addresses = (await lookup(host, { all: true, verbatim: true })).map(a => a.address)
    } catch {
      throw new HelpinatorBlockedUrl(`Could not resolve ${host}`)
    }
  }
  if (addresses.length === 0 || !addresses.every(addressAllowed)) {
    throw new HelpinatorBlockedUrl(`${host} is not a public address`)
  }
}

export interface HelpinatorFetched {
  status: number
  contentType: string
  finalUrl: string
  // null when the body was over the cap, or `wantBody` rejected the response.
  body: string | null
}

// GET `url`, following up to MAX_REDIRECTS redirects, each target checked.
// `wantBody(status, contentType)` decides whether the body is read at all.
export async function helpinatorSafeFetch(
  url: string,
  opts: { headers: Record<string, string>, timeoutMs: number, maxBytes: number, wantBody?: (status: number, contentType: string) => boolean }
): Promise<HelpinatorFetched> {
  const signal = AbortSignal.timeout(opts.timeoutMs)
  let current = new URL(url)
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(current)
    const res = await fetch(current, { headers: opts.headers, redirect: 'manual', signal })
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => {})
      if (hop >= MAX_REDIRECTS) throw new HelpinatorBlockedUrl('Too many redirects')
      current = new URL(location, current)
      continue
    }
    const contentType = res.headers.get('content-type') ?? ''
    const finalUrl = current.toString()
    if (opts.wantBody && !opts.wantBody(res.status, contentType)) {
      await res.body?.cancel().catch(() => {})
      return { status: res.status, contentType, finalUrl, body: null }
    }
    return { status: res.status, contentType, finalUrl, body: await readCapped(res, opts.maxBytes) }
  }
}

// The body as text, or null once it passes `maxBytes` (the rest is never read).
async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {})
    return null
  }
  if (!res.body) return ''
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    parts.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(parts))
}
