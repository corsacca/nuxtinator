import { type Kysely, sql } from 'kysely'

// Cleanup: drop the legacy `body_json` and `body_text` columns left over
// from the pre-A2 (TipTap-JSON-canonical) era. The current canonical store
// is `body_md`. The FTS `body_tsv` generated column is recreated to source
// solely from body_md.

export async function up(db: Kysely<unknown>): Promise<void> {
  // Items: drop body_tsv, then the legacy columns, then recreate body_tsv.
  await sql`DROP INDEX IF EXISTS messages_items_body_tsv_idx`.execute(db)
  await sql`ALTER TABLE messages_items DROP COLUMN IF EXISTS body_tsv`.execute(db)
  await sql`ALTER TABLE messages_items DROP COLUMN IF EXISTS body_json`.execute(db)
  await sql`ALTER TABLE messages_items DROP COLUMN IF EXISTS body_text`.execute(db)
  await sql`
    ALTER TABLE messages_items
    ADD COLUMN body_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(body_md, ''))) STORED
  `.execute(db)
  await sql`CREATE INDEX messages_items_body_tsv_idx ON messages_items USING gin(body_tsv)`.execute(db)

  // Comments: same shape.
  await sql`DROP INDEX IF EXISTS messages_comments_body_tsv_idx`.execute(db)
  await sql`ALTER TABLE messages_comments DROP COLUMN IF EXISTS body_tsv`.execute(db)
  await sql`ALTER TABLE messages_comments DROP COLUMN IF EXISTS body_json`.execute(db)
  await sql`ALTER TABLE messages_comments DROP COLUMN IF EXISTS body_text`.execute(db)
  await sql`
    ALTER TABLE messages_comments
    ADD COLUMN body_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(body_md, ''))) STORED
  `.execute(db)
  await sql`CREATE INDEX messages_comments_body_tsv_idx ON messages_comments USING gin(body_tsv)`.execute(db)

  // body_md is now the only source of truth. Make it NOT NULL on comments
  // (items can be image/file kinds without a body).
  await sql`ALTER TABLE messages_comments ALTER COLUMN body_md SET NOT NULL`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Reverse: drop the new tsv, re-add the legacy columns (nullable), recreate
  // the older tsv expression that coalesced over them.
  await sql`ALTER TABLE messages_comments ALTER COLUMN body_md DROP NOT NULL`.execute(db)

  await sql`DROP INDEX IF EXISTS messages_comments_body_tsv_idx`.execute(db)
  await sql`ALTER TABLE messages_comments DROP COLUMN IF EXISTS body_tsv`.execute(db)
  await db.schema.alterTable('messages_comments').addColumn('body_json', 'jsonb').execute()
  await db.schema.alterTable('messages_comments').addColumn('body_text', 'text').execute()
  await sql`
    ALTER TABLE messages_comments
    ADD COLUMN body_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(body_md, body_text, ''))) STORED
  `.execute(db)
  await sql`CREATE INDEX messages_comments_body_tsv_idx ON messages_comments USING gin(body_tsv)`.execute(db)

  await sql`DROP INDEX IF EXISTS messages_items_body_tsv_idx`.execute(db)
  await sql`ALTER TABLE messages_items DROP COLUMN IF EXISTS body_tsv`.execute(db)
  await db.schema.alterTable('messages_items').addColumn('body_json', 'jsonb').execute()
  await db.schema.alterTable('messages_items').addColumn('body_text', 'text').execute()
  await sql`
    ALTER TABLE messages_items
    ADD COLUMN body_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(body_md, body_text, ''))) STORED
  `.execute(db)
  await sql`CREATE INDEX messages_items_body_tsv_idx ON messages_items USING gin(body_tsv)`.execute(db)
}
