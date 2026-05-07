import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('orgs')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('slug', 'text', col => col.notNull().unique())
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('suspended_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  // Slug shape: 1-40 lowercase alphanumerics + hyphens. Must start and end
  // with an alphanumeric (no leading/trailing hyphens). The `@` URL prefix
  // means no system-path collision is possible, so this is the only
  // validation needed.
  await sql`
    ALTER TABLE orgs ADD CONSTRAINT orgs_slug_shape
      CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$')
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('orgs').execute()
}
