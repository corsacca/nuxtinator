// Public widget API: config, origin allowlist, server-authoritative sessions,
// streaming, limits, and the visitor email.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { $fetch, url as nuxtUrl } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  getAppUserDb,
  cleanupHelpinatorTestData,
  createHelpinatorOrgWith,
  seedPortfolio,
  seedWidget,
  sendTurn,
  primeAiFake,
  resetAiFake,
  getAiFakeLog,
  widgetHeaders,
  SITE_ORIGIN
} from '../helpers'

describe('public widget API', () => {
  const sql = getHostAdminDb()

  beforeEach(async () => {
    await cleanupHelpinatorTestData(sql)
    await resetAiFake()
  })
  afterEach(async () => {
    await cleanupHelpinatorTestData(sql)
    await resetAiFake()
  })

  async function setup(widgetOpts: { cap?: number, enabled?: boolean } = {}) {
    const { org } = await createHelpinatorOrgWith(sql)
    const p = await seedPortfolio(sql, org.id, 'Public Help', { faq: 'Opening hours are 9-5.' })
    const widget = await seedWidget(sql, { orgId: org.id, portfolioId: p.id, sectionKey: 'faq', ...widgetOpts })
    return { org, widget }
  }

  it('GET config returns appearance defaults and availability', async () => {
    const { widget } = await setup()
    const cfg = await $fetch<{ id: string, appearance: Record<string, string>, aiAvailable: boolean, handoffAvailable: boolean }>(
      `/api/v1/helpinator/widgets/${widget.id}/config`, { headers: widgetHeaders() })
    expect(cfg.id).toBe(widget.id)
    expect(cfg.appearance.primary_color).toMatch(/^#[0-9a-f]{6}$/)
    expect(cfg.aiAvailable).toBe(true)
    expect(cfg.handoffAvailable).toBe(true) // inbox is loaded in the dev host
  })

  it('rejects an origin that is not on the widget\'s list', async () => {
    const { widget } = await setup()
    const err = await $fetch(`/api/v1/helpinator/widgets/${widget.id}/config`, {
      headers: widgetHeaders(null, 'https://evil.example')
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('404s an unknown or malformed widget id', async () => {
    expect((await $fetch(`/api/v1/helpinator/widgets/${randomUUID()}/config`, { headers: widgetHeaders() }).catch(e => e)).statusCode).toBe(404)
    expect((await $fetch('/api/v1/helpinator/widgets/nope/config', { headers: widgetHeaders() }).catch(e => e)).statusCode).toBe(404)
  })

  it('first turn creates a conversation and returns a token; later turns carry history', async () => {
    const { widget } = await setup()
    await primeAiFake({ text: 'We open at 9.' })
    const first = await sendTurn(widget.id, 'When do you open?')
    expect(first.token).toBeTruthy()
    expect(first.reset).toBe(false)
    expect(first.assistantMessage.content).toBe('We open at 9.')

    await primeAiFake({ text: 'Until 5.' })
    const second = await sendTurn(widget.id, 'And close?', first.token)
    expect(second.conversationId).toBe(first.conversationId)
    const calls = await getAiFakeLog()
    expect(JSON.stringify(calls[1]!.messages)).toContain('When do you open?')

    // Only the hash is stored.
    const [row] = await sql`SELECT session_hash, page_url, origin FROM helpinator_conversations WHERE id = ${first.conversationId}`
    expect(row!.session_hash).not.toBe(first.token)
    expect(row!.origin).toBe(SITE_ORIGIN)
    expect(row!.page_url).toBe(`${SITE_ORIGIN}/pricing`)

    const conv = await $fetch<{ messages: { role: string, content: string }[] }>(
      `/api/v1/helpinator/widgets/${widget.id}/conversation`, { headers: widgetHeaders(first.token) })
    expect(conv.messages.map(m => m.content)).toEqual(['When do you open?', 'We open at 9.', 'And close?', 'Until 5.'])
  })

  it('stores only http(s) page URLs (no javascript: links into the admin app)', async () => {
    const { widget } = await setup()
    const stored: (string | null)[] = []
    for (const pageUrl of ['javascript:alert(document.cookie)', 'data:text/html,<script>1</script>', 'not a url', 'https://site.example/a b']) {
      await primeAiFake({ text: 'ok' })
      const turn = await $fetch<{ conversationId: string }>(`/api/v1/helpinator/widgets/${widget.id}/messages`, {
        method: 'POST', headers: widgetHeaders(), body: { message: 'hi', pageUrl }
      })
      const [row] = await sql`SELECT page_url FROM helpinator_conversations WHERE id = ${turn.conversationId}`
      stored.push(row!.page_url)
    }
    expect(stored).toEqual([null, null, null, 'https://site.example/a%20b'])
  })

  it('records the pages the bot grounded on and the searches it ran', async () => {
    const { widget } = await setup()
    await primeAiFake({ text: 'ok', toolCalls: [{ name: 'search', input: { query: 'opening hours' } }] })
    const turn = await sendTurn(widget.id, 'hi')
    const [row] = await sql`SELECT pages_loaded, searches FROM helpinator_messages WHERE id = ${turn.assistantMessage.id}`
    expect(row!.pages_loaded).toEqual([{ ref: `section:${widget.libraryId}:faq`, title: 'Title faq' }])
    expect(row!.searches).toEqual(['opening hours'])
  })

  it('auto-searches every visitor message and injects the hits as a second, non-cached system part', async () => {
    const { widget } = await setup()
    await primeAiFake({ text: 'ok' })
    const turn = await sendTurn(widget.id, 'opening hours')
    const call = (await getAiFakeLog()).find(c => c.kind === 'complete')!
    const parts = call.system as Array<{ text: string, cache?: boolean }>
    expect(parts).toHaveLength(2)
    expect(parts[0]!.cache).toBe(true)
    expect(parts[1]!.cache).toBeUndefined()
    expect(parts[1]!.text).toContain('Search hits')
    expect(parts[1]!.text).toContain(`section:${widget.libraryId}:faq`)
    expect(call.tools).toEqual(['search', 'load_page'])
    // The hits are logged on the reply so the transcript can show them.
    const [row] = await sql`SELECT search_hits FROM helpinator_messages WHERE id = ${turn.assistantMessage.id}`
    expect(row!.search_hits).toContainEqual({ ref: `section:${widget.libraryId}:faq`, title: 'Title faq' })
  })

  it('streams a turn as server-sent events', async () => {
    const { widget } = await setup()
    await primeAiFake({ text: 'Streaming reply' })
    const res = await fetch(nuxtUrl(`/api/v1/helpinator/widgets/${widget.id}/messages`), {
      method: 'POST',
      headers: { ...widgetHeaders(), 'content-type': 'application/json', 'accept': 'text/event-stream' },
      body: JSON.stringify({ message: 'hi' })
    })
    const text = await res.text()
    expect(text).toContain('event: session')
    expect(text).toContain('event: delta')
    expect(text).toContain('event: done')
  })

  it('rejects over-long messages', async () => {
    const { widget } = await setup()
    const err = await sendTurn(widget.id, 'x'.repeat(2001)).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('enforces the per-widget daily cap', async () => {
    const { widget } = await setup({ cap: 1 })
    await primeAiFake({ text: 'one' })
    await sendTurn(widget.id, 'first')
    const err = await sendTurn(widget.id, 'second').catch(e => e)
    expect(err.statusCode).toBe(429)
  })

  it('holds no DB transaction open while the model is answering', async () => {
    const { widget } = await setup()
    await primeAiFake({ text: 'slow answer', toolCalls: [{ name: 'search', input: { query: 'opening hours' } }], delayMs: 1500 })
    const turn = sendTurn(widget.id, 'opening hours?')
    await new Promise(r => setTimeout(r, 700))
    // As app_user: pg_stat_activity hides other roles' session state.
    const open = await getAppUserDb()<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE state LIKE 'idle in transaction%' AND now() - xact_start > interval '400 milliseconds'
    `
    expect(open[0]!.n).toBe(0)
    expect((await turn).assistantMessage.content).toBe('slow answer')
  })

  it('the per-client limit holds under parallel requests', async () => {
    // Disabled, so the turns that get past the limiter stop at a quick 503.
    const { widget } = await setup({ enabled: false })
    const results = await Promise.all(Array.from({ length: 20 }, () => sendTurn(widget.id, 'hi').catch(e => e)))
    const codes = results.map(r => r.statusCode)
    expect(codes.filter(c => c !== 429)).toHaveLength(8)
  })

  it('a disabled widget reports unavailable and refuses turns', async () => {
    const { widget } = await setup({ enabled: false })
    const cfg = await $fetch<{ aiAvailable: boolean }>(`/api/v1/helpinator/widgets/${widget.id}/config`, { headers: widgetHeaders() })
    expect(cfg.aiAvailable).toBe(false)
    expect((await sendTurn(widget.id, 'hi').catch(e => e)).statusCode).toBe(503)
  })

  it('stores the optional visitor email without elevating', async () => {
    const { widget } = await setup()
    await primeAiFake({ text: 'ok' })
    const turn = await sendTurn(widget.id, 'hi')
    await $fetch(`/api/v1/helpinator/widgets/${widget.id}/email`, {
      method: 'PUT', headers: widgetHeaders(turn.token), body: { email: 'Visitor@Example.com' }
    })
    const [row] = await sql`SELECT visitor_email, inbox_conversation_id FROM helpinator_conversations WHERE id = ${turn.conversationId}`
    expect(row!.visitor_email).toBe('visitor@example.com')
    expect(row!.inbox_conversation_id).toBeNull()
  })
})
