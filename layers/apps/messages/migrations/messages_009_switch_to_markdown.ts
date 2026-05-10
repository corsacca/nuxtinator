import { type Kysely, sql } from 'kysely'

// Switch storage from TipTap JSON to raw markdown text. Items + comments
// gain a `body_md` column and the FTS tsvector is regenerated to source
// from it. Old rows with body_json still render via the body_text fallback
// — they just don't have a markdown source on file.

export async function up(db: Kysely<unknown>): Promise<void> {
  // Items
  await db.schema.alterTable('messages_items').addColumn('body_md', 'text').execute()
  await sql`ALTER TABLE messages_items DROP COLUMN body_tsv`.execute(db)
  await sql`
    ALTER TABLE messages_items
    ADD COLUMN body_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(body_md, body_text, ''))) STORED
  `.execute(db)
  await sql`CREATE INDEX messages_items_body_tsv_idx ON messages_items USING gin(body_tsv)`.execute(db)

  // Comments
  await db.schema.alterTable('messages_comments').addColumn('body_md', 'text').execute()
  await sql`ALTER TABLE messages_comments ALTER COLUMN body_text DROP NOT NULL`.execute(db)
  await sql`ALTER TABLE messages_comments DROP COLUMN body_tsv`.execute(db)
  await sql`
    ALTER TABLE messages_comments
    ADD COLUMN body_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(body_md, body_text, ''))) STORED
  `.execute(db)
  await sql`CREATE INDEX messages_comments_body_tsv_idx ON messages_comments USING gin(body_tsv)`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Reverse: drop body_md and recreate the original tsv expression.
  await sql`ALTER TABLE messages_comments DROP COLUMN body_tsv`.execute(db)
  await db.schema.alterTable('messages_comments').dropColumn('body_md').execute()
  await sql`
    ALTER TABLE messages_comments
    ADD COLUMN body_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(body_text, ''))) STORED
  `.execute(db)
  await sql`CREATE INDEX messages_comments_body_tsv_idx ON messages_comments USING gin(body_tsv)`.execute(db)

  await sql`ALTER TABLE messages_items DROP COLUMN body_tsv`.execute(db)
  await db.schema.alterTable('messages_items').dropColumn('body_md').execute()
  await sql`
    ALTER TABLE messages_items
    ADD COLUMN body_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(body_text, ''))) STORED
  `.execute(db)
  await sql`CREATE INDEX messages_items_body_tsv_idx ON messages_items USING gin(body_tsv)`.execute(db)
}
