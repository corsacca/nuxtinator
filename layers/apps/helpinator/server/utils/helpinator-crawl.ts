// The website-library crawler: discover the pages one hop from a source URL,
// extract each page's main content as markdown, store it, and embed it.
//
// A run is fire-and-forget: the route stamps the source `syncing` with a fresh
// run token and returns; the run then does its work in short org-scoped
// transactions (never holding one across a network call). Every write
// re-checks the token, so a newer run for the same source supersedes an older
// one — the older run simply stops writing. Nothing blocks a re-sync.
//
// Politeness: a named user agent, robots.txt disallows honoured, a few
// concurrent fetches with a short gap, a per-page timeout and size cap.
import { createHash, randomUUID } from 'node:crypto'
import { sql, type Transaction } from 'kysely'
import { parseHTML } from 'linkedom'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import robotsParser from 'robots-parser'

import type { Database } from '#core/server/database/schema'
import { db } from '#core/server/utils/database'
import { embed, chunkMarkdown, vectorSql, resolveEmbeddingModel, type AiReindexer, type AiReindexProgress } from '#ai/server'
import type { HelpinatorSourceRow } from './helpinator-libraries'
import { helpinatorNormalizeUrl } from './helpinator-libraries'

type Tx = Transaction<Database>

// The slice of the DOM the crawler touches. linkedom's parseHTML is typed
// loosely and the nitro tsconfig has no DOM lib, so the document is cast to
// this once at each parse site.
interface DomNode {
  textContent: string | null
  innerHTML: string
  getAttribute(name: string): string | null
  remove(): void
  querySelector(sel: string): DomNode | null
  querySelectorAll(sel: string): Iterable<DomNode>
  cloneNode(deep: boolean): DomNode
}
interface DomDocument extends DomNode {
  body: DomNode | null
}
function parseDom(html: string): DomDocument {
  return (parseHTML(html) as unknown as { document: DomDocument }).document
}

export const HELPINATOR_CRAWL_USER_AGENT = 'NuxtinatorHelpinator/1.0 (+https://github.com/corsacca/nuxtinator)'
const FETCH_TIMEOUT_MS = 10_000
const MAX_HTML_BYTES = 2 * 1024 * 1024
const CONCURRENCY = 3
const GAP_MS = 250
// Extensions that are never HTML pages.
const SKIP_EXT_RE = /\.(pdf|jpe?g|png|gif|webp|svg|ico|css|js|mjs|json|xml|rss|atom|zip|gz|tar|mp3|mp4|mov|avi|webm|woff2?|ttf|eot|doc|docx|xls|xlsx|ppt|pptx|csv)$/i

// --- Scope transactions (the crawl has no request) ---

export async function helpinatorScopeTx<T>(orgId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return await db.transaction().execute(async (tx) => {
    if (orgId) await sql`select set_config('app.current_org', ${orgId}, true)`.execute(tx)
    return await fn(tx)
  })
}

// --- Discovery ---

export interface HelpinatorCrawlPlan {
  start: string
  // Every URL to fetch, start page first, already normalised and capped.
  urls: string[]
}

function pathPrefixOf(start: URL): string {
  const p = start.pathname.replace(/\/+$/, '')
  return p || '/'
}

function underPrefix(candidate: URL, prefix: string): boolean {
  if (prefix === '/') return true
  return candidate.pathname === prefix || candidate.pathname.startsWith(`${prefix}/`)
}

// Same-host links in `html`, one hop from `start`, optionally restricted to
// paths under the start path. Pure — exported for tests.
export function helpinatorDiscoverLinks(html: string, start: string, opts: { restrictToPath: boolean, maxPages: number }): HelpinatorCrawlPlan {
  const startUrl = new URL(start)
  const prefix = pathPrefixOf(startUrl)
  const urls: string[] = [start]
  const seen = new Set<string>([start])
  const document = parseDom(html)
  for (const a of Array.from(document.querySelectorAll('a[href]'))) {
    if (urls.length >= opts.maxPages) break
    const href = a.getAttribute('href') ?? ''
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue
    let abs: string | null
    try {
      abs = helpinatorNormalizeUrl(new URL(href, startUrl).toString())
    } catch {
      continue
    }
    if (!abs) continue
    const u = new URL(abs)
    if (u.hostname !== startUrl.hostname) continue
    if (SKIP_EXT_RE.test(u.pathname)) continue
    if (opts.restrictToPath && !underPrefix(u, prefix)) continue
    if (seen.has(abs)) continue
    seen.add(abs)
    urls.push(abs)
  }
  return { start, urls }
}

// --- Extraction ---

export interface HelpinatorExtracted {
  title: string
  markdown: string
}

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
turndown.remove(['script', 'style', 'noscript', 'iframe', 'svg', 'form', 'button', 'time'] as never)

function cleanMarkdown(md: string): string {
  return md
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Readability picks the main article; the fallback is the whole body with
// chrome elements stripped, for pages readability rejects (short listings).
export function helpinatorExtract(html: string, url: string): HelpinatorExtracted {
  const document = parseDom(html)
  const docTitle = (document.querySelector('title')?.textContent ?? '').trim()
  for (const el of Array.from(document.querySelectorAll('time'))) el.remove()

  let article: { title?: string | null, content?: string | null } | null
  try {
    // Readability mutates the document; work on a clone for the fallback.
    article = new Readability(document.cloneNode(true) as never, { charThreshold: 100 }).parse()
  } catch {
    article = null
  }

  let contentHtml = article?.content ?? ''
  if (!contentHtml.trim()) {
    for (const sel of ['nav', 'header', 'footer', 'aside', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]']) {
      for (const el of Array.from(document.querySelectorAll(sel))) el.remove()
    }
    contentHtml = (document.querySelector('main') ?? document.body)?.innerHTML ?? ''
  }
  const markdown = cleanMarkdown(turndown.turndown(contentHtml))
  const h1 = (document.querySelector('h1')?.textContent ?? '').trim()
  const title = (article?.title ?? '').trim() || h1 || docTitle || url
  return { title: title.slice(0, 300), markdown }
}

export function helpinatorContentHash(title: string, markdown: string): string {
  return createHash('sha256').update(title).update('\n').update(markdown).digest('hex')
}

// --- Fetching ---

async function fetchHtml(url: string): Promise<{ status: number, html: string | null, finalUrl: string }> {
  const res = await fetch(url, {
    headers: { 'user-agent': HELPINATOR_CRAWL_USER_AGENT, 'accept': 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  })
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !/text\/html|application\/xhtml/i.test(type)) return { status: res.status, html: null, finalUrl: res.url || url }
  const buf = await res.arrayBuffer()
  if (buf.byteLength > MAX_HTML_BYTES) return { status: res.status, html: null, finalUrl: res.url || url }
  return { status: res.status, html: new TextDecoder().decode(buf), finalUrl: res.url || url }
}

async function robotsFor(start: URL): Promise<{ isAllowed: (url: string) => boolean }> {
  const robotsUrl = `${start.origin}/robots.txt`
  try {
    const res = await fetch(robotsUrl, { headers: { 'user-agent': HELPINATOR_CRAWL_USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return { isAllowed: () => true }
    const parsed = robotsParser(robotsUrl, await res.text())
    return { isAllowed: url => parsed.isAllowed(url, HELPINATOR_CRAWL_USER_AGENT) !== false }
  } catch {
    return { isAllowed: () => true }
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// --- Indexing one page ---

async function replaceChunks(tx: Tx, pageId: string, libraryId: string, title: string, markdown: string): Promise<number> {
  const pieces = chunkMarkdown(markdown).map(c => ({
    heading: c.heading,
    text: `${title}${c.heading ? ` › ${c.heading}` : ''}\n\n${c.text}`
  }))
  const { vectors, model } = await embed({ tx, input: pieces.map(p => p.text) })
  await tx.deleteFrom('helpinator_library_chunks').where('page_id', '=', pageId).execute()
  for (let i = 0; i < pieces.length; i++) {
    await tx
      .insertInto('helpinator_library_chunks')
      .values({
        page_id: pageId,
        library_id: libraryId,
        ordinal: i,
        heading: pieces[i]!.heading,
        content: pieces[i]!.text,
        embedding: vectorSql(vectors[i]!),
        model
      })
      .execute()
  }
  return pieces.length
}

// --- The run ---

class Superseded extends Error {}

async function assertToken(tx: Tx, sourceId: string, token: string): Promise<void> {
  const row = await tx.selectFrom('helpinator_library_sources').select('run_token').where('id', '=', sourceId).executeTakeFirst()
  if (!row || row.run_token !== token) throw new Superseded()
}

interface RunCounters {
  pages: number
  bytes: number
  skipped: number
  failed: string[]
}

async function processUrl(orgId: string | null, source: HelpinatorSourceRow, token: string, url: string, startedAt: Date, counters: RunCounters): Promise<void> {
  let fetched: Awaited<ReturnType<typeof fetchHtml>>
  try {
    fetched = await fetchHtml(url)
  } catch (err) {
    counters.failed.push(`${url}: ${(err as Error)?.message ?? 'fetch failed'}`)
    return
  }
  if (!fetched.html) {
    counters.skipped++
    return
  }
  const extracted = helpinatorExtract(fetched.html, url)
  if (!extracted.markdown) {
    counters.skipped++
    return
  }
  const hash = helpinatorContentHash(extracted.title, extracted.markdown)
  const bytes = Buffer.byteLength(extracted.markdown, 'utf8')

  await helpinatorScopeTx(orgId, async (tx) => {
    await assertToken(tx, source.id, token)
    const existing = await tx
      .selectFrom('helpinator_library_pages')
      .select(['id', 'source_id', 'content_hash'])
      .where('library_id', '=', source.library_id)
      .where('url', '=', url)
      .executeTakeFirst()
    // Another source in this library crawled the URL first: it owns the page.
    if (existing && existing.source_id !== source.id) {
      counters.skipped++
      return
    }
    const currentModel = await resolveEmbeddingModel(tx)
    let pageId: string
    if (existing) {
      pageId = existing.id
      const chunkModels = await tx.selectFrom('helpinator_library_chunks').select('model').distinct().where('page_id', '=', pageId).execute()
      const upToDate = existing.content_hash === hash && chunkModels.length === 1 && (!currentModel || chunkModels[0]!.model === currentModel)
      await tx
        .updateTable('helpinator_library_pages')
        .set({ title: extracted.title, content: extracted.markdown, content_hash: hash, bytes, fetched_at: startedAt })
        .where('id', '=', pageId)
        .execute()
      counters.pages++
      counters.bytes += bytes
      if (upToDate) return
    } else {
      const inserted = await tx
        .insertInto('helpinator_library_pages')
        .values({ library_id: source.library_id, source_id: source.id, url, title: extracted.title, content: extracted.markdown, content_hash: hash, bytes, fetched_at: startedAt })
        .returning('id')
        .executeTakeFirstOrThrow()
      pageId = inserted.id
      counters.pages++
      counters.bytes += bytes
    }
    await replaceChunks(tx, pageId, source.library_id, extracted.title, extracted.markdown)
  })
}

async function finish(orgId: string | null, sourceId: string, token: string, patch: Partial<{ status: 'done' | 'error', page_count: number, bytes: number, last_error: string | null }>): Promise<void> {
  await helpinatorScopeTx(orgId, async (tx) => {
    await tx
      .updateTable('helpinator_library_sources')
      .set({ ...patch, last_synced_at: sql`now()` })
      .where('id', '=', sourceId)
      .where('run_token', '=', token)
      .execute()
  })
}

async function runSource(orgId: string | null, source: HelpinatorSourceRow, token: string): Promise<void> {
  const startedAt = new Date()
  const counters: RunCounters = { pages: 0, bytes: 0, skipped: 0, failed: [] }
  try {
    const startUrl = new URL(source.url)
    const robots = await robotsFor(startUrl)
    if (!robots.isAllowed(source.url)) {
      await finish(orgId, source.id, token, { status: 'error', last_error: 'robots.txt disallows this URL' })
      return
    }
    const first = await fetchHtml(source.url)
    if (!first.html) {
      await finish(orgId, source.id, token, { status: 'error', last_error: `Start page returned ${first.status}${first.html === null ? ' or was not HTML' : ''}` })
      return
    }
    const plan = helpinatorDiscoverLinks(first.html, source.url, { restrictToPath: source.restrict_to_path, maxPages: source.max_pages })
    const queue = plan.urls.filter(u => robots.isAllowed(u))

    // Bounded concurrency with a short gap between starts.
    let next = 0
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (next < queue.length) {
        const url = queue[next++]!
        await processUrl(orgId, source, token, url, startedAt, counters)
        await sleep(GAP_MS)
      }
    })
    await Promise.all(workers)

    // Pages of this source not seen this run are gone from the site.
    await helpinatorScopeTx(orgId, async (tx) => {
      await assertToken(tx, source.id, token)
      await tx
        .deleteFrom('helpinator_library_pages')
        .where('source_id', '=', source.id)
        .where('fetched_at', '<', startedAt)
        .execute()
    })

    const errorNote = counters.failed.length ? `${counters.failed.length} page(s) failed: ${counters.failed.slice(0, 3).join('; ')}` : null
    await finish(orgId, source.id, token, { status: 'done', page_count: counters.pages, bytes: counters.bytes, last_error: errorNote })
  } catch (err) {
    if (err instanceof Superseded) return
    const message = ((err as { statusMessage?: string, message?: string })?.statusMessage || (err as Error)?.message || 'Crawl failed').slice(0, 500)
    console.error(`[helpinator] crawl of ${source.url} failed:`, err)
    await finish(orgId, source.id, token, { status: 'error', page_count: counters.pages, bytes: counters.bytes, last_error: message })
  }
}

// In-process registry of running syncs so `helpinatorSyncStatus` can say what
// this process is doing; the DB row is the source of truth across processes.
const running = new Map<string, Promise<void>>()

// Stamp the source `syncing` with a new run token and start the crawl in the
// background. Returns the token; the promise in `done` is for tests and for
// chaining ("sync all" runs a library's sources one after another via
// `opts.after`).
export async function helpinatorStartSourceSync(
  tx: Tx,
  orgId: string | null,
  source: HelpinatorSourceRow,
  opts: { after?: Promise<void> } = {}
): Promise<{ token: string, done: Promise<void> }> {
  const token = randomUUID()
  await tx
    .updateTable('helpinator_library_sources')
    .set({ status: 'syncing', run_token: token, run_started_at: sql`now()`, last_error: null })
    .where('id', '=', source.id)
    .execute()
  const fresh = { ...source, status: 'syncing' as const, run_token: token }
  // Start after the caller's transaction commits so the token is visible.
  const done = new Promise<void>((resolve) => {
    setTimeout(async () => {
      await (opts.after ?? Promise.resolve()).catch(() => {})
      const p = runSource(orgId, fresh, token).finally(() => {
        if (running.get(source.id) === p) running.delete(source.id)
        resolve()
      })
      running.set(source.id, p)
    }, 50)
  })
  return { token, done }
}

export function helpinatorSyncRunning(sourceId: string): boolean {
  return running.has(sourceId)
}

// Re-embed every page in scope from its stored markdown (no re-fetch), for the
// AI settings pages' "re-embed" after an embedding model change.
export async function helpinatorReindexLibraries(tx: Tx, progress?: AiReindexProgress): Promise<{ chunks: number }> {
  const pages = await tx.selectFrom('helpinator_library_pages').select(['id', 'library_id', 'title', 'content']).execute()
  progress?.total(pages.length)
  let chunks = 0
  for (const p of pages) {
    const n = await replaceChunks(tx, p.id, p.library_id, p.title, p.content)
    chunks += n
    progress?.item(n)
  }
  return { chunks }
}

export const HELPINATOR_REINDEXER: AiReindexer = {
  key: 'helpinator.libraries',
  label: 'Helpinator — library pages',
  currentModels: async (tx) => {
    const rows = await (tx as Tx).selectFrom('helpinator_library_chunks').select('model').distinct().execute()
    return rows.map(r => r.model)
  },
  run: async (tx, progress) => {
    if (!(await resolveEmbeddingModel(tx))) return { chunks: 0 }
    return await helpinatorReindexLibraries(tx as Tx, progress)
  }
}
