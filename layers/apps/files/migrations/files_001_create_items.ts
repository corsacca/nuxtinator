import { type Kysely, sql } from 'kysely'

// The unified files item: a `doc` (authored markdown) or a `file` (uploaded
// binary). One flat, org-wide list. `body_tsv` is a generated tsvector over
// title + filename + body + tags for full-text search (mirrors messages_items).

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('files_items')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('kind', 'text', col => col.notNull())
    .addColumn('title', 'text', col => col.notNull())
    .addColumn('body_md', 'text')
    .addColumn('storage_key', 'text')
    .addColumn('filename', 'text')
    .addColumn('mime', 'text')
    .addColumn('size_bytes', 'bigint')
    .addColumn('tags', sql`text[]`, col => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('share_token', 'uuid')
    .addColumn('created_by', 'uuid', col => col.notNull().references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('last_edited_by', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('last_edited_at', 'timestamptz')
    .addColumn('deleted_at', 'timestamptz')
    .execute()

  // Full-text search vector over the searchable surface (NOT binary contents).
  // Tags are excluded here — `array_to_string` isn't IMMUTABLE so it can't go
  // in a generated column; tag filtering uses the dedicated GIN index below.
  await sql`
    ALTER TABLE files_items
    ADD COLUMN body_tsv tsvector
      GENERATED ALWAYS AS (
        to_tsvector('english',
          coalesce(title, '') || ' ' ||
          coalesce(filename, '') || ' ' ||
          coalesce(body_md, ''))
      ) STORED
  `.execute(db)
  await sql`CREATE INDEX files_items_body_tsv_idx ON files_items USING gin(body_tsv)`.execute(db)

  // Tag filtering.
  await sql`CREATE INDEX files_items_tags_idx ON files_items USING gin(tags)`.execute(db)

  // Unique, partial: at most one active share link per item (token nullable).
  await sql`
    CREATE UNIQUE INDEX files_items_share_token_idx
      ON files_items (share_token) WHERE share_token IS NOT NULL
  `.execute(db)

  await db.schema
    .createIndex('files_items_created_idx')
    .on('files_items')
    .columns(['created_at'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('files_items').execute()
}
