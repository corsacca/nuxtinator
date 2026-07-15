import { type Kysely, sql } from 'kysely'

// `inbox_comments.author_id` is an ON DELETE SET NULL FK to users. Without an
// index, deleting a user forces a sequential scan of inbox_comments for the
// SET NULL fixup — this backs that FK enforcement (and any by-author lookup).
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE INDEX inbox_comments_author_idx ON inbox_comments (author_id)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS inbox_comments_author_idx`.execute(db)
}
