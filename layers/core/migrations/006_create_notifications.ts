import { type Kysely, sql } from 'kysely'

// Global, app-agnostic notification store. Every app layer writes rows here via
// `createNotification()` instead of shipping its own notifications table. The
// store is a "snapshot": producers write finished display text (`title`,
// `body`, `icon`) plus a naive in-app `link` — there are deliberately no
// foreign keys into app tables, so one table can serve every app.
//
// `email_mode` records the producer's per-notification delivery intent:
//   immediate — emailed promptly by the immediate sweep, then skipped by digest
//   digest    — rolled into the daily digest email
//   none      — never emailed (in-bell only)
//
// `emailed_at` is the de-dupe stamp. `none` rows are stamped at write time so
// the pending-email index never carries them. (Same trick the old
// messages_notifications used.)
//
// In multi-tenant mode the tenancy layer's `notifications_T001` retrofit adds
// `org_id` + RLS on top of this table; single-tenant deploys scope by
// `user_id` alone.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('notifications')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('app_id', 'text', col => col.notNull())
    .addColumn('title', 'text', col => col.notNull())
    .addColumn('body', 'text')
    .addColumn('icon', 'text')
    .addColumn('link', 'text', col => col.notNull())
    .addColumn('actor_id', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('email_mode', 'text', col =>
      col.notNull().defaultTo('none').check(sql`email_mode IN ('immediate', 'digest', 'none')`))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('read_at', 'timestamptz')
    .addColumn('emailed_at', 'timestamptz')
    .execute()

  // Feed lookup: a user's notifications newest-first.
  await db.schema
    .createIndex('notifications_user_created_idx')
    .on('notifications')
    .columns(['user_id', 'created_at'])
    .execute()

  // Unread counts (global badge + per-app rail badges).
  await sql`
    CREATE INDEX notifications_user_unread_idx
      ON notifications (user_id, app_id)
      WHERE read_at IS NULL
  `.execute(db)

  // Email sweeps: not yet emailed, not yet read.
  await sql`
    CREATE INDEX notifications_email_pending_idx
      ON notifications (email_mode, created_at)
      WHERE emailed_at IS NULL AND read_at IS NULL
  `.execute(db)

  // Retention sweep scans by age.
  await db.schema
    .createIndex('notifications_created_idx')
    .on('notifications')
    .column('created_at')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('notifications').execute()
}
