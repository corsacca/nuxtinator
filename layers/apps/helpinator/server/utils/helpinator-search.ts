// Vector search across a widget's libraries: website pages from
// helpinator_library_chunks and portfolio sections from the context layer's
// index (`searchSections`, auto-imported from the context layer). The query is
// embedded once and both indexes are ranked by cosine distance, then collapsed
// to one hit per page or section.
//
// ISOLATION: the library set comes from the caller (the conversation's
// snapshot of its widget's binding), never from the model. Hits carry an
// opaque `ref` the load tool accepts: `page:<id>` or `section:<library>:<key>`.
import { sql, type Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import { isEmbeddingConfigured, embed, cosineDistance, vectorSql } from '#ai/server'
import type { HelpinatorLibraryRow } from './helpinator-libraries'

type Tx = Transaction<Database>

export interface HelpinatorSearchHit {
  ref: string
  title: string
  url: string | null
  library: string
  snippet: string
  distance: number
}

export const HELPINATOR_SEARCH_HITS = 8

export function helpinatorPageRef(pageId: string): string {
  return `page:${pageId}`
}
export function helpinatorSectionRef(libraryId: string, key: string): string {
  return `section:${libraryId}:${key}`
}

export async function helpinatorSearch(
  tx: Tx,
  opts: { libraries: HelpinatorLibraryRow[], query: string, limit?: number }
): Promise<HelpinatorSearchHit[]> {
  const limit = opts.limit ?? HELPINATOR_SEARCH_HITS
  const query = opts.query.trim()
  if (!query || opts.libraries.length === 0) return []
  if (!(await isEmbeddingConfigured(tx))) return []

  const websiteIds = opts.libraries.filter(l => l.kind === 'website').map(l => l.id)
  const portfolioLibs = opts.libraries.filter(l => l.kind === 'portfolio' && l.portfolio_id)
  const libraryByPortfolio = new Map(portfolioLibs.map(l => [l.portfolio_id!, l]))
  const libraryById = new Map(opts.libraries.map(l => [l.id, l]))

  const vector = (await embed({ tx, input: [query] })).vectors[0]!
  const hits: HelpinatorSearchHit[] = []

  if (websiteIds.length) {
    const rows = await tx
      .selectFrom('helpinator_library_chunks as c')
      .innerJoin('helpinator_library_pages as p', 'p.id', 'c.page_id')
      .select(['c.page_id', 'c.library_id', 'p.title', 'p.url', 'c.content'])
      .select(cosineDistance('c.embedding', vector).as('distance'))
      .where('c.library_id', 'in', websiteIds)
      .orderBy(sql`c.embedding <=> ${vectorSql(vector)}`)
      .limit(limit * 3)
      .execute()
    const seen = new Set<string>()
    for (const r of rows) {
      if (seen.has(r.page_id)) continue
      seen.add(r.page_id)
      hits.push({
        ref: helpinatorPageRef(r.page_id),
        title: r.title || r.url,
        url: r.url,
        library: libraryById.get(r.library_id)?.name ?? '',
        snippet: r.content.slice(0, 300),
        distance: Number(r.distance)
      })
    }
  }

  if (portfolioLibs.length) {
    const sectionHits = await searchSections(tx, { portfolioIds: [...libraryByPortfolio.keys()], queryVector: vector, limit })
    if (sectionHits.length) {
      const titles = new Map<string, string>()
      for (const pid of libraryByPortfolio.keys()) {
        for (const s of await getPortfolioSections(tx, pid)) titles.set(`${pid}:${s.key}`, s.title)
      }
      for (const h of sectionHits) {
        const lib = libraryByPortfolio.get(h.portfolio_id)
        if (!lib) continue
        hits.push({
          ref: helpinatorSectionRef(lib.id, h.section_key),
          title: titles.get(`${h.portfolio_id}:${h.section_key}`) ?? h.section_key,
          url: null,
          library: lib.name,
          snippet: h.snippet,
          distance: h.distance
        })
      }
    }
  }

  hits.sort((a, b) => a.distance - b.distance)
  return hits.slice(0, limit)
}
