import { type Kysely, sql } from 'kysely'

// Notifications moved to the global core `notifications` table. The messages
// layer now writes there via `notifyMessages` → `createNotification`, so its
// own table is dropped. `CASCADE` removes the RLS policy + `org_id` column that
// messages_T001 added in multi-tenant deploys.
//
// Regular migrations run before tenancy `_T` migrations, so on a fresh DB this
// drops the table messages_008 created before messages_T001 (which no longer
// references it) runs.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS messages_notifications CASCADE`.execute(db)
}

// Best-effort recreate of the original (single-tenant) shape from
// messages_008. Multi-tenant columns/policy are not restored — rollback isn't
// used at boot, and the table is defunct.
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('messages_notifications')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('kind', 'text', col =>
      col.notNull().check(sql`kind IN ('mention', 'dm', 'comment', 'reply')`))
    .addColumn('item_id', 'uuid', col => col.references('messages_items.id').onDelete('cascade'))
    .addColumn('comment_id', 'uuid', col => col.references('messages_comments.id').onDelete('cascade'))
    .addColumn('conversation_id', 'uuid', col => col.references('messages_conversations.id').onDelete('cascade'))
    .addColumn('actor_id', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('read_at', 'timestamptz')
    .addColumn('emailed_at', 'timestamptz')
    .execute()
}
