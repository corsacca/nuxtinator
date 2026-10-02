// The section vector index: chunk → embed → context_section_chunks, run on
// every section save, plus the similarity search over it. Also exported for
// helpinator, whose portfolio-backed libraries read this same index.
//
// Indexing is best-effort: a save must never fail because OpenRouter is down
// or no embedding model is set. Failures leave `index_state = 'stale'` with
// the message in `index_error`; the section page shows a warning and a
// re-embed button. With embeddings not configured the state stays 'none'.
import { sql, type Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import {
  isEmbeddingConfigured,
  embed,
  chunkMarkdown,
  vectorSql,
  cosineDistance,
  resolveEmbeddingModel,
  type AiReindexer,
  type AiReindexProgress
} from '#ai/server'
import type { SectionRow } from './section-helpers'

type Tx = Transaction<Database>

export const CONTEXT_EMBEDDINGS_FEATURE = 'context.embeddings'
export const CONTEXT_REINDEXER_KEY = 'context.sections'

// Chunks include the section title as a first line so a search on the title
// alone still lands, and so the snippet reads naturally.
function chunkTexts(title: string, content: string): { heading: string, text: string }[] {
  return chunkMarkdown(content).map(c => ({
    heading: c.heading,
    text: `${title}${c.heading ? ` › ${c.heading}` : ''}\n\n${c.text}`
  }))
}

async function setState(tx: Tx, sectionId: string, state: 'none' | 'ok' | 'stale', error: string | null): Promise<void> {
  await tx
    .updateTable('context_sections')
    .set({ index_state: state, index_error: error })
    .where('id', '=', sectionId)
    .execute()
}

function errorMessage(err: unknown): string {
  const e = err as { statusMessage?: string, message?: string }
  return (e?.statusMessage || e?.message || 'Embedding failed').slice(0, 500)
}

// Replace a section's chunks with fresh embeddings of `content`. Returns the
// chunk count; never throws for AI failures (state → 'stale'). Empty content
// clears the index and reports 'ok'.
export async function indexSection(
  tx: Tx,
  section: Pick<SectionRow, 'id' | 'portfolio_id' | 'section_key' | 'content'>,
  title: string
): Promise<{ state: 'none' | 'ok' | 'stale', chunks: number, error: string | null }> {
  if (!(await isEmbeddingConfigured(tx))) {
    await setState(tx, section.id, 'none', null)
    return { state: 'none', chunks: 0, error: null }
  }
  const pieces = chunkTexts(title, section.content ?? '')
  try {
    const { vectors, model } = await embed({ tx, input: pieces.map(p => p.text) })
    await tx.deleteFrom('context_section_chunks').where('section_id', '=', section.id).execute()
    for (let i = 0; i < pieces.length; i++) {
      await tx
        .insertInto('context_section_chunks')
        .values({
          section_id: section.id,
          portfolio_id: section.portfolio_id,
          ordinal: i,
          heading: pieces[i]!.heading,
          content: pieces[i]!.text,
          embedding: vectorSql(vectors[i]!),
          model
        })
        .execute()
    }
    await setState(tx, section.id, 'ok', null)
    return { state: 'ok', chunks: pieces.length, error: null }
  } catch (err) {
    const message = errorMessage(err)
    console.error(`[context] section index failed for ${section.portfolio_id}/${section.section_key}: ${message}`)
    await setState(tx, section.id, 'stale', message)
    return { state: 'stale', chunks: 0, error: message }
  }
}

// Every section of a portfolio (or of every portfolio in scope with no id).
// context_sections has no org_id or RLS of its own; the join to
// context_portfolios (RLS-scoped) is what limits the rows to the current org.
export async function reindexSections(tx: Tx, portfolioId?: string, progress?: AiReindexProgress): Promise<{ chunks: number }> {
  let q = tx
    .selectFrom('context_sections as s')
    .innerJoin('context_portfolios as p', 'p.id', 's.portfolio_id')
    .leftJoin('context_section_definitions as d', join => join
      .onRef('d.portfolio_id', '=', 's.portfolio_id')
      .onRef('d.key', '=', 's.section_key'))
    .select(['s.id', 's.portfolio_id', 's.section_key', 's.content', 'd.title'])
  if (portfolioId) q = q.where('s.portfolio_id', '=', portfolioId)
  const rows = await q.execute()
  progress?.total(rows.length)
  let chunks = 0
  for (const row of rows) {
    const result = await indexSection(tx, row, row.title ?? row.section_key)
    if (result.state === 'stale') throw createError({ statusCode: 502, statusMessage: result.error ?? 'Embedding failed' })
    chunks += result.chunks
    progress?.item(result.chunks)
  }
  return { chunks }
}

export interface SectionSearchHit {
  portfolio_id: string
  section_id: string
  section_key: string
  heading: string
  snippet: string
  distance: number
}

// Nearest chunks to `query` across `portfolioIds`, collapsed to the best chunk
// per section. `queryVector` lets a caller that already embedded the query
// (helpinator merging two indexes) skip the second embedding call.
export async function searchSections(
  tx: Tx,
  opts: { portfolioIds: string[], query?: string, queryVector?: number[], limit?: number }
): Promise<SectionSearchHit[]> {
  const limit = opts.limit ?? 8
  if (opts.portfolioIds.length === 0) return []
  let vector = opts.queryVector
  if (!vector) {
    if (!opts.query?.trim() || !(await isEmbeddingConfigured(tx))) return []
    vector = (await embed({ tx, input: [opts.query] })).vectors[0]!
  }
  const rows = await tx
    .selectFrom('context_section_chunks as c')
    .innerJoin('context_sections as s', 's.id', 'c.section_id')
    .select(['c.portfolio_id', 'c.section_id', 's.section_key', 'c.heading', 'c.content'])
    .select(cosineDistance('c.embedding', vector).as('distance'))
    .where('c.portfolio_id', 'in', opts.portfolioIds)
    .orderBy(sql`c.embedding <=> ${vectorSql(vector)}`)
    .limit(limit * 3)
    .execute()
  const best = new Map<string, SectionSearchHit>()
  for (const r of rows) {
    if (best.has(r.section_id)) continue
    best.set(r.section_id, {
      portfolio_id: r.portfolio_id,
      section_id: r.section_id,
      section_key: r.section_key,
      heading: r.heading,
      snippet: r.content.slice(0, 300),
      distance: Number(r.distance)
    })
    if (best.size >= limit) break
  }
  return [...best.values()]
}

// Distinct embedding models stored in this scope's index.
export async function sectionIndexModels(tx: Tx): Promise<string[]> {
  const rows = await tx.selectFrom('context_section_chunks').select('model').distinct().execute()
  return rows.map(r => r.model)
}

export const CONTEXT_REINDEXER: AiReindexer = {
  key: CONTEXT_REINDEXER_KEY,
  label: 'Context — portfolio sections',
  currentModels: tx => sectionIndexModels(tx as Tx),
  run: async (tx, progress) => {
    // Nothing to do when no model resolves: leave the index as it is.
    if (!(await resolveEmbeddingModel(tx))) return { chunks: 0 }
    return await reindexSections(tx as Tx, undefined, progress)
  }
}
