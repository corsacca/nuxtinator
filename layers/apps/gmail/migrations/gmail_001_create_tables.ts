import { type Kysely, sql } from 'kysely'

// Gmail layer tables. All keyed on users, none on orgs: a mailbox is personal
// and there is deliberately no tenancy retrofit for this layer, so the
// background IMAP sessions can read and write without an org context.
//
// Vocabulary columns (account status, draft status/mode, snooze reason) are
// open zod-validated strings; `folder` is the one code-owned-forever enum
// and carries a CHECK.
//
// Gmail's X-GM-MSGID / X-GM-THRID are unsigned 64-bit; they are stored as
// text so a high id can never overflow bigint. Message identity is
// (account_id, gm_msgid) — stable across folder moves, which change the UID.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('gmail_accounts')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('email', 'text', col => col.notNull())
    .addColumn('display_name', 'text')
    .addColumn('signature_html', 'text')
    .addColumn('app_password_enc', 'text', col => col.notNull())
    .addColumn('status', 'text', col => col.notNull().defaultTo('connecting'))
    .addColumn('last_error', 'text')
    .addColumn('folders', 'jsonb')
    .addColumn('sync_state', 'jsonb', col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('backfill_done', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('last_sync_at', 'timestamptz')
    .addColumn('lease_holder', 'text')
    .addColumn('lease_expires_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('gmail_accounts_user_email_uniq')
    .on('gmail_accounts')
    .columns(['user_id', 'email'])
    .unique()
    .execute()

  await db.schema
    .createTable('gmail_labels')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('account_id', 'uuid', col => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('path', 'text', col => col.notNull())
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('special_use', 'text')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('gmail_labels_account_path_uniq')
    .on('gmail_labels')
    .columns(['account_id', 'path'])
    .unique()
    .execute()

  await db.schema
    .createTable('gmail_threads')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('account_id', 'uuid', col => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('gm_thrid', 'text', col => col.notNull())
    .addColumn('subject', 'text')
    .addColumn('snippet', 'text')
    .addColumn('first_message_at', 'timestamptz')
    .addColumn('last_message_at', 'timestamptz')
    .addColumn('sort_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('message_count', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('unread_count', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('trash_count', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('spam_count', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('has_attachments', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('in_inbox', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('is_starred', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('is_important', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('has_sent', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('labels', sql`text[]`, col => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('participants', 'jsonb', col => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('snoozed_until', 'timestamptz')
    .addColumn('woken_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('gmail_threads_account_thrid_uniq')
    .on('gmail_threads')
    .columns(['account_id', 'gm_thrid'])
    .unique()
    .execute()

  // The unified list: every view filters on user_id and orders by sort_at.
  await sql`
    CREATE INDEX gmail_threads_user_sort_idx
      ON gmail_threads (user_id, sort_at DESC)
  `.execute(db)

  await sql`
    CREATE INDEX gmail_threads_snoozed_idx
      ON gmail_threads (user_id, snoozed_until) WHERE snoozed_until IS NOT NULL
  `.execute(db)

  await sql`
    CREATE INDEX gmail_threads_labels_idx
      ON gmail_threads USING GIN (labels)
  `.execute(db)

  await db.schema
    .createTable('gmail_messages')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('account_id', 'uuid', col => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('thread_id', 'uuid', col => col.notNull().references('gmail_threads.id').onDelete('cascade'))
    .addColumn('gm_msgid', 'text', col => col.notNull())
    .addColumn('gm_thrid', 'text', col => col.notNull())
    .addColumn('folder', 'text', col => col.notNull().check(sql`folder IN ('all', 'trash', 'spam')`))
    .addColumn('uid', 'integer', col => col.notNull())
    .addColumn('message_id', 'text')
    .addColumn('in_reply_to', 'text')
    .addColumn('from_name', 'text')
    .addColumn('from_addr', 'text')
    .addColumn('to_json', 'jsonb', col => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('cc_json', 'jsonb', col => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('bcc_json', 'jsonb', col => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('reply_to_json', 'jsonb', col => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('subject', 'text')
    .addColumn('snippet', 'text')
    .addColumn('internal_date', 'timestamptz', col => col.notNull())
    .addColumn('size_bytes', 'integer')
    .addColumn('labels', sql`text[]`, col => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('flags', sql`text[]`, col => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('has_attachments', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('text_part', 'text')
    .addColumn('html_part', 'text')
    .addColumn('body_html', 'text')
    .addColumn('body_text', 'text')
    .addColumn('body_fetched_at', 'timestamptz')
    .addColumn('attachments', 'jsonb', col => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('gmail_messages_account_msgid_uniq')
    .on('gmail_messages')
    .columns(['account_id', 'gm_msgid'])
    .unique()
    .execute()

  await db.schema
    .createIndex('gmail_messages_thread_idx')
    .on('gmail_messages')
    .columns(['thread_id', 'internal_date'])
    .execute()

  // Reconciliation diffs the mirrored UID set per folder against the server.
  await db.schema
    .createIndex('gmail_messages_account_folder_uid_idx')
    .on('gmail_messages')
    .columns(['account_id', 'folder', 'uid'])
    .execute()

  // Local search over sender, subject and snippet.
  await sql`
    CREATE INDEX gmail_messages_search_idx
      ON gmail_messages USING GIN (
        to_tsvector('simple', coalesce(subject, '') || ' ' || coalesce(from_name, '') || ' ' || coalesce(from_addr, '') || ' ' || coalesce(snippet, ''))
      )
  `.execute(db)

  await db.schema
    .createTable('gmail_snoozes')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('thread_id', 'uuid', col => col.notNull().references('gmail_threads.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('wake_at', 'timestamptz', col => col.notNull())
    .addColumn('woke_at', 'timestamptz')
    .addColumn('wake_reason', 'text')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  // The wake sweep's work list.
  await sql`
    CREATE INDEX gmail_snoozes_pending_idx
      ON gmail_snoozes (wake_at) WHERE woke_at IS NULL
  `.execute(db)

  await db.schema
    .createTable('gmail_drafts')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('account_id', 'uuid', col => col.notNull().references('gmail_accounts.id').onDelete('cascade'))
    .addColumn('thread_id', 'uuid', col => col.references('gmail_threads.id').onDelete('set null'))
    .addColumn('reply_to_message_id', 'uuid', col => col.references('gmail_messages.id').onDelete('set null'))
    .addColumn('mode', 'text', col => col.notNull().defaultTo('new'))
    .addColumn('to_json', 'jsonb', col => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('cc_json', 'jsonb', col => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('bcc_json', 'jsonb', col => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('subject', 'text')
    .addColumn('body_html', 'text')
    .addColumn('attachments', 'jsonb', col => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('status', 'text', col => col.notNull().defaultTo('draft'))
    .addColumn('send_after', 'timestamptz')
    .addColumn('attempts', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('last_error', 'text')
    .addColumn('sent_message_id', 'text')
    .addColumn('sent_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('gmail_drafts_user_idx')
    .on('gmail_drafts')
    .columns(['user_id', 'updated_at'])
    .execute()

  // The send sweep's work list.
  await sql`
    CREATE INDEX gmail_drafts_queued_idx
      ON gmail_drafts (send_after) WHERE status = 'queued'
  `.execute(db)

  await db.schema
    .createTable('gmail_addresses')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('email', 'text', col => col.notNull())
    .addColumn('name', 'text')
    .addColumn('seen_count', 'integer', col => col.notNull().defaultTo(1))
    .addColumn('last_seen_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('gmail_addresses_user_email_uniq')
    .on('gmail_addresses')
    .columns(['user_id', 'email'])
    .unique()
    .execute()

  await db.schema
    .createTable('gmail_user_prefs')
    .addColumn('user_id', 'uuid', col => col.primaryKey().references('users.id').onDelete('cascade'))
    .addColumn('prefs', 'jsonb', col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('gmail_user_prefs').ifExists().execute()
  await db.schema.dropTable('gmail_addresses').ifExists().execute()
  await db.schema.dropTable('gmail_drafts').ifExists().execute()
  await db.schema.dropTable('gmail_snoozes').ifExists().execute()
  await db.schema.dropTable('gmail_messages').ifExists().execute()
  await db.schema.dropTable('gmail_threads').ifExists().execute()
  await db.schema.dropTable('gmail_labels').ifExists().execute()
  await db.schema.dropTable('gmail_accounts').ifExists().execute()
}
