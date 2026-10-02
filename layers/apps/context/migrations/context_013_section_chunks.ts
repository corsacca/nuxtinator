import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// Vector index over section content, for the assistant's search tool and for
// helpinator's portfolio-backed libraries. One row per chunk of a section
// (see `#ai/server` chunkMarkdown); `model` records which embedding model
// produced the vector so a model change can be detected and re-embedded.
//
// Needs the pgvector extension. `CREATE EXTENSION` is attempted here for
// deployments whose migration role may create it (Railway's pgvector
// template, superuser dev databases); elsewhere an operator runs
// `CREATE EXTENSION vector;` as superuser first and this becomes a no-op.
//
// `index_state` on context_sections tracks whether the section's chunks match
// its current content: none (never indexed / embeddings not configured), ok,
// stale (the last embed attempt failed — see index_error).
export async function up(db: Kysely<unknown>): Promise<void> {
  // Checked before attempting CREATE: a failed statement aborts the migration's
  // transaction, so nothing can be queried after it.
  const present = await sql<{ n: number }>`select count(*)::int as n from pg_extension where extname = 'vector'`.execute(db)
  if (!present.rows[0]?.n) {
    try {
      await sql`CREATE EXTENSION vector`.execute(db)
    } catch (err) {
      throw new Error(`pgvector is not installed and this role may not create it. Run "CREATE EXTENSION vector;" as a superuser, then restart. (${(err as Error).message})`, { cause: err })
    }
  }

  await db.schema
    .createTable('context_section_chunks')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('section_id', 'uuid', col => col.notNull().references('context_sections.id').onDelete('cascade'))
    .addColumn('portfolio_id', 'uuid', col => col.notNull())
    .addColumn('ordinal', 'integer', col => col.notNull())
    .addColumn('heading', 'text', col => col.notNull().defaultTo(''))
    .addColumn('content', 'text', col => col.notNull())
    .addColumn('embedding', sql`vector(1536)`, col => col.notNull())
    .addColumn('model', 'text', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('context_section_chunks_section_ordinal_uq', ['section_id', 'ordinal'])
    .execute()

  await sql`
    CREATE INDEX context_section_chunks_embedding_idx
      ON context_section_chunks USING hnsw (embedding vector_cosine_ops)
  `.execute(db)
  await db.schema
    .createIndex('context_section_chunks_portfolio_idx')
    .on('context_section_chunks')
    .column('portfolio_id')
    .execute()

  await db.schema
    .alterTable('context_sections')
    .addColumn('index_state', 'text', col => col.notNull().defaultTo('none'))
    .addColumn('index_error', 'text')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('context_sections').dropColumn('index_error').dropColumn('index_state').execute()
  await db.schema.dropTable('context_section_chunks').ifExists().execute()
}
