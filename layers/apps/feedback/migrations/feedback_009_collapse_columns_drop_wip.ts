import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// Collapse the four workflow columns (BACKLOG/PLANNING/BUILDING/TESTING) into a
// single DOING column, leaving the board with four columns: FEEDBACK INBOX,
// DOING, DONE, ARCHIVE. A card's former workflow column is preserved as a
// `phase` in post_meta so the DOING column can still show where it is. Also
// drops the per-column WIP limit, which is no longer used.
export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Stamp the phase from each card's current workflow column. Both `cards`
  // and `columns` have a `post_meta`, so the source reference must be qualified.
  await sql`
    UPDATE cards
    SET post_meta = jsonb_set(coalesce(cards.post_meta, '{}'::jsonb), '{phase}', to_jsonb(lower(c.name)))
    FROM columns c
    WHERE cards.column_id = c.id
      AND c.name IN ('BACKLOG', 'PLANNING', 'BUILDING', 'TESTING')
  `.execute(db)

  // 2. Move PLANNING/BUILDING/TESTING cards onto BACKLOG (which becomes DOING).
  await sql`
    UPDATE cards
    SET column_id = (SELECT id FROM columns WHERE name = 'BACKLOG')
    WHERE column_id IN (SELECT id FROM columns WHERE name IN ('PLANNING', 'BUILDING', 'TESTING'))
  `.execute(db)

  // 3. Rename BACKLOG -> DOING and drop the now-empty stage columns.
  await sql`UPDATE columns SET name = 'DOING' WHERE name = 'BACKLOG'`.execute(db)
  await sql`DELETE FROM columns WHERE name IN ('PLANNING', 'BUILDING', 'TESTING')`.execute(db)

  // 4. Re-number positions: INBOX, DOING, DONE, ARCHIVE.
  await sql`UPDATE columns SET position = 1 WHERE name = 'FEEDBACK INBOX'`.execute(db)
  await sql`UPDATE columns SET position = 2 WHERE name = 'DOING'`.execute(db)
  await sql`UPDATE columns SET position = 3 WHERE name = 'DONE'`.execute(db)
  await sql`UPDATE columns SET position = 4 WHERE name = 'ARCHIVE'`.execute(db)

  // 5. WIP limits are gone.
  await db.schema.alterTable('columns').dropColumn('wip_limit').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Best-effort reversal. DOING becomes BACKLOG again and the three stage
  // columns are recreated empty; merged cards stay in BACKLOG and keep their
  // (now-unused) phase metadata.
  await db.schema.alterTable('columns').addColumn('wip_limit', 'integer').execute()
  await sql`UPDATE columns SET name = 'BACKLOG' WHERE name = 'DOING'`.execute(db)
  await sql`
    INSERT INTO columns (name, position, is_collapsed, post_meta) VALUES
      ('PLANNING', 3, false, '{}'::jsonb),
      ('BUILDING', 4, false, '{}'::jsonb),
      ('TESTING',  5, false, '{}'::jsonb)
    ON CONFLICT (name) DO NOTHING
  `.execute(db)
  await sql`UPDATE columns SET position = 2 WHERE name = 'BACKLOG'`.execute(db)
  await sql`UPDATE columns SET position = 6 WHERE name = 'DONE'`.execute(db)
  await sql`UPDATE columns SET position = 7 WHERE name = 'ARCHIVE'`.execute(db)
}
