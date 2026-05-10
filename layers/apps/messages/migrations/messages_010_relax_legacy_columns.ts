import { type Kysely, sql } from 'kysely'

// The original schema (messages_004) made comments.body_json NOT NULL because
// it was the canonical body. After A2's switch to markdown storage, new
// inserts don't write body_json, which now needs to be nullable.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE messages_comments ALTER COLUMN body_json DROP NOT NULL`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE messages_comments ALTER COLUMN body_json SET NOT NULL`.execute(db)
}
