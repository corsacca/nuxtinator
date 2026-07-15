import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// Add a TODO column between FEEDBACK INBOX and DOING. TODO is the approved
// queue: triage drags a card from FEEDBACK INBOX into TODO to green-light it;
// whoever picks it up moves it to DOING. Board order becomes:
// FEEDBACK INBOX (1), TODO (2), DOING (3), DONE (4), ARCHIVE (5).
//
// Both statements are guarded on TODO's absence so a database that already
// has a TODO column is left untouched.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE columns SET position = position + 1
    WHERE position >= 2
      AND NOT EXISTS (SELECT 1 FROM columns WHERE name = 'TODO')
  `.execute(db)
  await sql`
    INSERT INTO columns (name, position, is_collapsed, post_meta)
    SELECT 'TODO', 2, false, '{}'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM columns WHERE name = 'TODO')
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Rescue TODO cards back to the inbox before dropping the column.
  await sql`
    UPDATE cards SET column_id = (SELECT id FROM columns WHERE name = 'FEEDBACK INBOX')
    WHERE column_id IN (SELECT id FROM columns WHERE name = 'TODO')
  `.execute(db)
  await sql`DELETE FROM columns WHERE name = 'TODO'`.execute(db)
  await sql`UPDATE columns SET position = position - 1 WHERE position > 2`.execute(db)
}
