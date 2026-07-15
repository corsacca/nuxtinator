import { type Kysely, sql } from 'kysely'

// Per-app tenancy migration; runs after inbox_T001. RLS scopes what rows a
// session can SEE, but unique constraints are checked against ALL rows —
// uniques on values the outside world controls must be rebuilt org-leading or
// two orgs can't hold the same value.
//
// - inbox_messages.email_message_id: the same mail (one Message-Id) can
//   legitimately arrive for two orgs on one install (CC'd to both orgs'
//   domains). Inserts use bare ON CONFLICT DO NOTHING, so the index shape may
//   differ between single and multi mode.
//
// Deliberately NOT rescoped:
// - inbox_conversations.reply_token — 80 random bits, collisions impossible,
//   and the inbound webhook's token→org resolution (withRecordOrgContext on
//   reply_token) requires the token to identify one row globally.
// - inbox_blocked_senders.channel_id — the FK target row is org-scoped, so
//   the unique is already org-bound.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('inbox_messages_email_message_id_uniq').execute()
  await sql`
    CREATE UNIQUE INDEX inbox_messages_org_email_message_id_uniq
      ON inbox_messages (org_id, email_message_id) WHERE email_message_id IS NOT NULL
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('inbox_messages_org_email_message_id_uniq').execute()
  await sql`
    CREATE UNIQUE INDEX inbox_messages_email_message_id_uniq
      ON inbox_messages (email_message_id) WHERE email_message_id IS NOT NULL
  `.execute(db)
}
