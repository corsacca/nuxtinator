import { type Kysely, sql } from 'kysely'

// `kind='site'` items hold a self-contained HTML page in body_md (served raw
// via the public site route). Their bodies are excluded from the body_tsv
// generated column: raw markup is noise to search, and large pages (base64
// data URIs are common in self-contained HTML) can overflow Postgres's 1MB
// tsvector limit, which would make every INSERT/UPDATE on the row fail.
// Site titles and filenames remain searchable.

export async function up(db: Kysely<unknown>): Promise<void> {
  // Dropping the generated column also drops its GIN index.
  await sql`ALTER TABLE files_items DROP COLUMN body_tsv`.execute(db)
  await sql`
    ALTER TABLE files_items
    ADD COLUMN body_tsv tsvector
      GENERATED ALWAYS AS (
        to_tsvector('english',
          coalesce(title, '') || ' ' ||
          coalesce(filename, '') || ' ' ||
          CASE WHEN kind = 'site' THEN '' ELSE coalesce(body_md, '') END)
      ) STORED
  `.execute(db)
  await sql`CREATE INDEX files_items_body_tsv_idx ON files_items USING gin(body_tsv)`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE files_items DROP COLUMN body_tsv`.execute(db)
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
}
