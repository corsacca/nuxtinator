// pgvector helpers shared by every layer that stores embeddings. Pure code, so
// it lives beside the types in core and is re-exported by both the throwing
// `#ai/server` fallback and the real AI layer — consumers import from
// `#ai/server` either way.
//
// A vector is stored in a `vector(AI_EMBED_DIMENSIONS)` column. The literal
// form pgvector accepts is '[0.1,0.2,...]'; `vectorSql()` binds it as a text
// parameter and casts, so no float ever lands in the SQL string unescaped.
import { sql, type RawBuilder } from 'kysely'

// Width of every vector column. A model that cannot produce this many
// dimensions is rejected at setting time.
export const AI_EMBED_DIMENSIONS = 1536

export function toPgVector(v: number[]): string {
  if (v.length !== AI_EMBED_DIMENSIONS) {
    throw new Error(`Expected a ${AI_EMBED_DIMENSIONS}-dimension vector, got ${v.length}`)
  }
  return `[${v.map(n => (Number.isFinite(n) ? n : 0)).join(',')}]`
}

export function vectorSql(v: number[]): RawBuilder<unknown> {
  return sql`${toPgVector(v)}::vector`
}

// `<=>` is pgvector's cosine distance (0 = identical, 2 = opposite). Callers
// ORDER BY it ascending and may filter on it.
export function cosineDistance(column: string, v: number[]): RawBuilder<number> {
  return sql<number>`${sql.ref(column)} <=> ${vectorSql(v)}`
}

// Cosine similarity in JS for the rare in-process case (tests, small merges).
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}
