// The website crawler against an in-process fixture site: discovery rules
// (same host, one hop, path restriction, max pages, skipped PDFs and off-site
// links, robots.txt), readability extraction to markdown, the content-hash
// skip on re-crawl, vanished pages, per-library URL ownership, and pruning.
import { describe, it, expect, afterEach, beforeEach, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupHelpinatorTestData,
  createHelpinatorOrgWith,
  createWebsiteLibrary,
  addSource,
  getLibrary,
  waitForSync,
  startFixtureSite,
  seedDocsTree,
  article,
  resetAiFake,
  type FixtureSite
} from '../helpers'

describe('website crawl', () => {
  const sql = getHostAdminDb()
  let site: FixtureSite

  beforeAll(async () => {
    site = await startFixtureSite()
  })
  afterAll(async () => {
    await site.close()
  })
  beforeEach(async () => {
    await cleanupHelpinatorTestData(sql)
    await resetAiFake()
    site.pages.clear()
    site.hits.length = 0
    seedDocsTree(site)
  })
  afterEach(async () => {
    await cleanupHelpinatorTestData(sql)
  })

  async function pagesOf(libraryId: string) {
    return await sql<{ url: string, title: string, content: string, source_id: string, content_hash: string }[]>`
      SELECT url, title, content, source_id, content_hash FROM helpinator_library_pages WHERE library_id = ${libraryId} ORDER BY url
    `
  }

  it('crawls the start page and its same-path links, extracts markdown, and indexes chunks', async () => {
    const { opts } = await createHelpinatorOrgWith(sql)
    const lib = await createWebsiteLibrary(opts)
    const source = await addSource(opts, lib.id, `${site.origin}/docs`, { restrict_to_path: true, max_pages: 10 })
    expect(source.status).toBe('syncing')

    const done = await waitForSync(opts, lib.id)
    const s = done.sources[0]!
    expect(s.status).toBe('done')
    expect(s.last_error).toBeNull()

    const pages = await pagesOf(lib.id)
    // /docs, /docs/anvils, /docs/horseshoes — not /pricing (off path), not
    // example.com (off host), not the PDF, not /docs/secret (robots).
    expect(pages.map(p => p.url)).toEqual([`${site.origin}/docs`, `${site.origin}/docs/anvils`, `${site.origin}/docs/horseshoes`])
    expect(s.page_count).toBe(3)
    expect(site.hits).not.toContain('/docs/secret')
    expect(site.hits).not.toContain('/pricing')

    const anvils = pages.find(p => p.url.endsWith('/docs/anvils'))!
    expect(anvils.title).toBe('Anvils')
    expect(anvils.content).toContain('anvil forging paragraph 1')
    expect(anvils.content).not.toContain('Pricing') // nav stripped
    expect(anvils.content).not.toContain('<p>')

    const chunks = await sql<{ n: number, models: string[] }[]>`
      SELECT count(*)::int AS n, array_agg(DISTINCT model) AS models FROM helpinator_library_chunks WHERE library_id = ${lib.id}
    `
    expect(chunks[0]!.n).toBeGreaterThanOrEqual(3)
    expect(chunks[0]!.models).toEqual(['test/embed-small'])
    expect(done.stats.pages).toBe(3)
    expect(done.stats.models).toEqual(['test/embed-small'])
  })

  it('without the path restriction it follows every same-host link one hop, capped by max_pages', async () => {
    const { opts } = await createHelpinatorOrgWith(sql)
    const lib = await createWebsiteLibrary(opts)
    await addSource(opts, lib.id, `${site.origin}/docs`, { restrict_to_path: false, max_pages: 3 })
    const done = await waitForSync(opts, lib.id)
    expect(done.sources[0]!.status).toBe('done')
    const pages = await pagesOf(lib.id)
    expect(pages).toHaveLength(3)
    expect(pages[0]!.url).toBe(`${site.origin}/docs`)
  })

  it('re-crawl skips unchanged pages, re-embeds changed ones, and drops vanished ones', async () => {
    const { opts } = await createHelpinatorOrgWith(sql)
    const lib = await createWebsiteLibrary(opts)
    const source = await addSource(opts, lib.id, `${site.origin}/docs`, { restrict_to_path: true, max_pages: 10 })
    await waitForSync(opts, lib.id)
    const before = await pagesOf(lib.id)
    const horseshoesBefore = before.find(p => p.url.endsWith('/docs/horseshoes'))!
    const embedsBefore = (await $fetch<Array<{ kind: string }>>('/api/_test/ai')).filter(c => c.kind === 'embed').length

    // Change anvils; horseshoes vanishes from the site (still linked → 404).
    site.pages.set('/docs/anvils', { html: article('Anvils', 'anvil forging', '<p>NEW-SENTENCE about tempering.</p>') })
    site.pages.delete('/docs/horseshoes')

    await $fetch(`/api/helpinator/libraries/${lib.id}/sources/${source.id}/sync`, { method: 'POST', ...opts })
    const done = await waitForSync(opts, lib.id)
    expect(done.sources[0]!.status).toBe('done')

    const after = await pagesOf(lib.id)
    expect(after.map(p => p.url)).toEqual([`${site.origin}/docs`, `${site.origin}/docs/anvils`])
    expect(after.find(p => p.url.endsWith('/docs/anvils'))!.content).toContain('NEW-SENTENCE')
    expect(after.find(p => p.url.endsWith('/docs/horseshoes'))).toBeUndefined()
    // Unchanged /docs index was not re-embedded; changed anvils was: exactly one more embed call.
    const embedsAfter = (await $fetch<Array<{ kind: string }>>('/api/_test/ai')).filter(c => c.kind === 'embed').length
    expect(embedsAfter - embedsBefore).toBe(1)
    // Horseshoes' chunks are gone with the page.
    const orphan = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM helpinator_library_chunks WHERE page_id = (SELECT id FROM helpinator_library_pages WHERE content_hash = ${horseshoesBefore.content_hash})`
    expect(orphan[0]!.n).toBe(0)
  })

  it('a URL reached from two sources of one library belongs to the first, and pruning removes a page', async () => {
    const { opts } = await createHelpinatorOrgWith(sql)
    const lib = await createWebsiteLibrary(opts)
    const docs = await addSource(opts, lib.id, `${site.origin}/docs`, { restrict_to_path: true, max_pages: 10 })
    await waitForSync(opts, lib.id)
    // The home page links /docs/anvils too.
    const home = await addSource(opts, lib.id, `${site.origin}/`, { restrict_to_path: false, max_pages: 10 })
    const done = await waitForSync(opts, lib.id)
    expect(done.sources.map(s => s.status)).toEqual(['done', 'done'])
    const pages = await pagesOf(lib.id)
    expect(pages.find(p => p.url.endsWith('/docs/anvils'))!.source_id).toBe(docs.id)
    expect(pages.filter(p => p.source_id === home.id).map(p => p.url)).toEqual([`${site.origin}/`, `${site.origin}/pricing`])

    const listed = await $fetch<{ pages: Array<{ id: string, url: string }> }>(`/api/helpinator/libraries/${lib.id}/pages`, { query: { source: home.id }, ...opts })
    const pricing = listed.pages.find(p => p.url.endsWith('/pricing'))!
    const view = await $fetch<{ content: string }>(`/api/helpinator/libraries/${lib.id}/pages/${pricing.id}`, { ...opts })
    expect(view.content).toContain('pricing plans')
    await $fetch(`/api/helpinator/libraries/${lib.id}/pages/${pricing.id}`, { method: 'DELETE', ...opts })
    expect((await pagesOf(lib.id)).some(p => p.url.endsWith('/pricing'))).toBe(false)

    // Removing a source takes its pages with it, and only its pages.
    await $fetch(`/api/helpinator/libraries/${lib.id}/sources/${home.id}`, { method: 'DELETE', ...opts })
    expect((await pagesOf(lib.id)).map(p => p.url)).toEqual([`${site.origin}/docs`, `${site.origin}/docs/anvils`, `${site.origin}/docs/horseshoes`])
  })

  it('reports an unreachable start page as an error and never blocks a re-sync', async () => {
    const { opts } = await createHelpinatorOrgWith(sql)
    const lib = await createWebsiteLibrary(opts)
    const source = await addSource(opts, lib.id, `${site.origin}/missing`)
    let done = await waitForSync(opts, lib.id)
    expect(done.sources[0]!.status).toBe('error')
    expect(done.sources[0]!.last_error).toMatch(/404/)

    // A stuck "syncing" row is no obstacle: the next sync supersedes it.
    await sql`UPDATE helpinator_library_sources SET status = 'syncing', run_token = gen_random_uuid() WHERE id = ${source.id}`
    site.pages.set('/missing', { html: article('Found', 'found now') })
    const res = await $fetch<{ status: string }>(`/api/helpinator/libraries/${lib.id}/sources/${source.id}/sync`, { method: 'POST', ...opts })
    expect(res.status).toBe('syncing')
    done = await waitForSync(opts, lib.id)
    expect(done.sources[0]!.status).toBe('done')
    expect(done.sources[0]!.page_count).toBe(1)
    expect(await getLibrary(opts, lib.id)).toMatchObject({ stats: { pages: 1 } })
  })
})
