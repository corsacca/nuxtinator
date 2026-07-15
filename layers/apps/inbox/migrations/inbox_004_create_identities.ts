import { type Kysely, sql } from 'kysely'

// Per-user sending identities: an optional routable `alias` (so mail to
// `<alias>@<inbound-domain>` auto-assigns to that user, and personal replies
// send From that address) and an optional HTML `signature` appended to personal
// sends. One row per user. `user_id` CASCADEs — an identity is meaningless
// without its user. `alias` is nullable (a user may have a signature but no
// alias); the unique is partial so many aliasless users don't collide.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('inbox_identities')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('alias', 'text')
    .addColumn('signature', 'text')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await sql`CREATE UNIQUE INDEX inbox_identities_user_uniq ON inbox_identities (user_id)`.execute(db)
  await sql`CREATE UNIQUE INDEX inbox_identities_alias_uniq ON inbox_identities (alias) WHERE alias IS NOT NULL`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('inbox_identities').execute()
}
