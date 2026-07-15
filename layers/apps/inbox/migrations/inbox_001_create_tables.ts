import { type Kysely, sql } from 'kysely'

// Inbox kernel tables. Conversations key on crm_channels — the CRM layer's
// address registry — not on contact records: an inbound sender gets history
// before (and whether or not) they ever become a contact. The channel FK is
// NO ACTION (not CASCADE): channel identity rows are registry entries with
// no delete path, and a conversation must never vanish through a
// channel-side cascade. NO ACTION rather than RESTRICT because the check
// must defer to statement end — in multi mode an org deletion cascades into
// crm_channels and inbox_conversations along independent FK paths, and an
// immediate RESTRICT check would trip on whichever table cascades second.
//
// Vocabulary columns (conversation status, message status, source) are open,
// zod-validated strings — no CHECK (house rule: CHECKs only on
// code-owned-forever vocabularies). `direction` is the one true forever-enum.
//
// `email_message_id` is the inbound idempotency key (real Message-Id or a
// synthesized sha256 stand-in) AND, after a send, the provider's id so
// contact replies thread back. Unique here globally; multi mode rebuilds it
// org-leading in inbox_T002 (the same message can legitimately arrive for two
// orgs). Inserts must use bare ON CONFLICT DO NOTHING — never a named target
// — because the index shape differs between modes.
//
// `reply_token` stays globally unique even in multi mode: it is 80 random
// bits (collisions impossible in practice) and the inbound webhook resolves
// which org a reply belongs to by a single cross-org token lookup
// (withRecordOrgContext), which requires global uniqueness.
//
// Outbound queue state lives on the message row itself (`status 'queued'` +
// attempts/next_attempt_at, swept by a croner plugin) — there is no separate
// jobs table.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('inbox_conversations')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('channel_id', 'uuid', col => col.notNull().references('crm_channels.id').onDelete('no action'))
    .addColumn('subject', 'text')
    .addColumn('status', 'text', col => col.notNull().defaultTo('open'))
    .addColumn('assigned_user_id', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('reply_token', 'text', col => col.notNull())
    .addColumn('needs_review', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('source', 'text', col => col.notNull())
    .addColumn('counterparty_name', 'text')
    .addColumn('last_message_at', 'timestamptz')
    .addColumn('last_message_direction', 'text')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('inbox_conversations_reply_token_uniq')
    .on('inbox_conversations')
    .column('reply_token')
    .unique()
    .execute()

  await sql`
    CREATE INDEX inbox_conversations_status_last_idx
      ON inbox_conversations (status, last_message_at DESC)
  `.execute(db)

  await db.schema
    .createIndex('inbox_conversations_assigned_idx')
    .on('inbox_conversations')
    .column('assigned_user_id')
    .execute()

  await db.schema
    .createIndex('inbox_conversations_channel_idx')
    .on('inbox_conversations')
    .column('channel_id')
    .execute()

  // The "Held" queue is small relative to the table; partial keeps it cheap.
  await sql`
    CREATE INDEX inbox_conversations_needs_review_idx
      ON inbox_conversations (needs_review) WHERE needs_review
  `.execute(db)

  await db.schema
    .createTable('inbox_messages')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('conversation_id', 'uuid', col => col.notNull().references('inbox_conversations.id').onDelete('cascade'))
    .addColumn('direction', 'text', col => col.notNull().check(sql`direction IN ('inbound', 'outbound')`))
    .addColumn('status', 'text', col => col.notNull())
    .addColumn('sender_user_id', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('from_email', 'text')
    .addColumn('from_name', 'text')
    .addColumn('to_email', 'text')
    .addColumn('subject', 'text')
    .addColumn('body_html', 'text')
    .addColumn('body_stripped_html', 'text')
    .addColumn('body_text', 'text')
    .addColumn('email_message_id', 'text')
    .addColumn('in_reply_to', 'text')
    .addColumn('email_references', 'text')
    .addColumn('spam_score', 'numeric')
    .addColumn('raw_s3_key', 'text')
    .addColumn('authenticated', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('auth_result', 'text')
    .addColumn('hold_reason', 'text')
    .addColumn('failed_reason', 'text')
    .addColumn('provider_message_id', 'text')
    .addColumn('delivered_at', 'timestamptz')
    .addColumn('attempts', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('next_attempt_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  // Partial: drafts (and freshly queued rows before send) carry NULL and must
  // not collide with each other.
  await sql`
    CREATE UNIQUE INDEX inbox_messages_email_message_id_uniq
      ON inbox_messages (email_message_id) WHERE email_message_id IS NOT NULL
  `.execute(db)

  await db.schema
    .createIndex('inbox_messages_conversation_idx')
    .on('inbox_messages')
    .columns(['conversation_id', 'created_at'])
    .execute()

  await db.schema
    .createIndex('inbox_messages_provider_id_idx')
    .on('inbox_messages')
    .column('provider_message_id')
    .execute()

  // The send sweep's work list.
  await sql`
    CREATE INDEX inbox_messages_queued_idx
      ON inbox_messages (next_attempt_at) WHERE status = 'queued'
  `.execute(db)

  await db.schema
    .createTable('inbox_attachments')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('message_id', 'uuid', col => col.notNull().references('inbox_messages.id').onDelete('cascade'))
    .addColumn('s3_key', 'text', col => col.notNull())
    .addColumn('filename', 'text')
    .addColumn('content_type', 'text')
    .addColumn('size_bytes', 'integer')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('inbox_attachments_message_idx')
    .on('inbox_attachments')
    .column('message_id')
    .execute()

  // Spam blocklist — an inbound routing verdict, deliberately separate from
  // crm_channel_suppressions (outbound deliverability). Keyed by the claimed
  // channel row, so the unique is already org-bound through the FK and needs
  // no T-rescope.
  await db.schema
    .createTable('inbox_blocked_senders')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('channel_id', 'uuid', col => col.notNull().references('crm_channels.id').onDelete('cascade'))
    .addColumn('created_by', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('inbox_blocked_senders_channel_uniq')
    .on('inbox_blocked_senders')
    .column('channel_id')
    .unique()
    .execute()

}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('inbox_blocked_senders').execute()
  await db.schema.dropTable('inbox_attachments').execute()
  await db.schema.dropTable('inbox_messages').execute()
  await db.schema.dropTable('inbox_conversations').execute()
}
