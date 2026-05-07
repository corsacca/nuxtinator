import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('memberships')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('org_id', 'uuid', col => col.notNull().references('orgs.id').onDelete('cascade'))
    .addColumn('roles', sql`text[]`, col => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('memberships_user_org_unique')
    .unique()
    .on('memberships')
    .columns(['user_id', 'org_id'])
    .execute()

  await db.schema.createIndex('memberships_org_idx').on('memberships').column('org_id').execute()

  // Memberships are NOT RLS-protected: org context discovery (the middleware)
  // needs to read them without first having an active org. Auth happens in
  // application code.
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('memberships').execute()
}
