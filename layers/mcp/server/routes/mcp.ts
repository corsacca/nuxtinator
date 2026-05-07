import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
// Cross-layer import to the OAuth layer; see mcp-origin.ts for why we use
// the `#oauth/*` aliases declared in the OAuth layer's nuxt.config.ts
// instead of `~~/...` or `#imports`.
import { requireValidBearer } from '#oauth/bearer'
import { buildMcpServer } from '../mcp-layer/server'
import { assertAllowedOrigin } from '../utils/mcp-origin'

const MAX_BODY_BYTES = 2 * 1024 * 1024 // 2 MB
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  '2024-11-05',
  '2025-03-26',
  '2025-06-18',
  '2025-11-25'
])

export default defineEventHandler(async (event) => {
  // 1. Origin check (cheapest, runs first).
  assertAllowedOrigin(event)

  // 2. POST-only. GET/DELETE get 405 with Allow header.
  if (event.method !== 'POST') {
    setResponseHeader(event, 'Allow', 'POST')
    throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' })
  }

  // 3. Defense-in-depth MCP-Protocol-Version check. The SDK's transport also
  //    enforces this, but the inline check keeps the test surface stable
  //    independent of SDK version drift. We read the header here and apply
  //    it after parsing the body (so we can tell whether it's an initialize
  //    request — those are exempt from the header requirement).
  const protocolVersion = getHeader(event, 'mcp-protocol-version')

  // 4. Validate bearer token at the transport boundary (audience, expiry,
  //    revocation, client-enabled). Does NOT require a specific scope —
  //    each tool handler's dispatcher checks its own.
  const auth = await requireValidBearer(event)

  // 5. Body size cap before JSON parse (Content-Length + raw-body recheck).
  const contentLength = Number(getHeader(event, 'content-length') ?? '0')
  if (contentLength > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Payload Too Large' })
  }
  const raw = await readRawBody(event, 'utf8')
  if (raw && Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Payload Too Large' })
  }

  let body: unknown
  try {
    body = raw ? JSON.parse(raw) : undefined
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
  }

  // 6. Defense-in-depth protocol-version check. Validate the value
  //    when present, but DO NOT require the header on every non-
  //    initialize call — many real-world stdio bridges (mcp-remote
  //    and similar wrappers) don't propagate the negotiated version
  //    on every forwarded POST. The SDK still enforces protocol
  //    semantics internally during request handling, so missing the
  //    header at the route boundary is not a security gap.
  //    Initialize requests carry no MCP-Protocol-Version header per spec.
  if (protocolVersion !== undefined && !SUPPORTED_PROTOCOL_VERSIONS.has(protocolVersion)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Unsupported MCP-Protocol-Version: ${protocolVersion}`
    })
  }

  // 7. Build a per-request MCP server with the auth context bound.
  const server = await buildMcpServer({ auth, event })
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  try {
    await server.connect(transport)
    // h3 may be v1 (event.node.req/res) or v2 (event.req/res). Pick whichever
    // exposes a Node IncomingMessage / ServerResponse — the SDK's
    // getRequestListener bridge expects Node-style objects.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ev = event as any
    const nodeReq = ev.node?.req ?? ev.req
    const nodeRes = ev.node?.res ?? ev.res
    if (!nodeReq || !nodeRes) {
      throw new Error('mcp transport: could not locate Node req/res on h3 event')
    }
    await transport.handleRequest(nodeReq, nodeRes, body)
  }
  finally {
    await server.close().catch(() => {})
    await transport.close().catch(() => {})
  }
})
