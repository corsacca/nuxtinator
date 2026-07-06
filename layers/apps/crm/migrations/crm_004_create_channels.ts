import { type Kysely, sql } from 'kysely'

// Communication channels. crm_channels holds one row per distinct address
// identity (an email address, a phone number, ...) shared by every record
// that uses it; crm_contact_channels links records to channels per field.
// crm_channel_types stores admin-created channel types plus DB overrides of
// code-registered ones — code-owned defaults merge over these rows at read
// time, so a row only exists when something was explicitly customized.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('crm_channel_types')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('type_key', 'text', col => col.notNull())
    .addColumn('label', 'text')
    // Nullable so an override row of a code-registered type need not restate
    // the format; admin-created types set it at write time.
    .addColumn('value_format', 'text', col =>
      col.check(sql`value_format IN ('email', 'phone', 'handle', 'url', 'freeform')`))
    .addColumn('config', 'jsonb', col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('crm_channel_types_type_key_uniq')
    .on('crm_channel_types')
    .column('type_key')
    .unique()
    .execute()

  await db.schema
    .createTable('crm_channels')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('channel_type', 'text', col => col.notNull())
    .addColumn('value', 'text', col => col.notNull())
    .addColumn('normalized_value', 'text', col => col.notNull())
    .addColumn('verified', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('verified_at', 'timestamptz')
    // Verification plumbing: token issue/consume writes these; never exposed
    // to clients.
    .addColumn('verification_token_hash', 'text')
    .addColumn('verification_expires_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  // Channel identity: one row per (type, normalized address). Claim inserts
  // rely on this via ON CONFLICT DO NOTHING with no named target.
  await db.schema
    .createIndex('crm_channels_type_value_uniq')
    .on('crm_channels')
    .columns(['channel_type', 'normalized_value'])
    .unique()
    .execute()

  await db.schema
    .createTable('crm_contact_channels')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('record_id', 'uuid', col => col.notNull().references('crm_records.id').onDelete('cascade'))
    .addColumn('channel_id', 'uuid', col => col.notNull().references('crm_channels.id').onDelete('cascade'))
    .addColumn('field_key', 'text', col => col.notNull())
    .addColumn('label', 'text')
    .addColumn('is_primary', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('sort_order', 'integer', col => col.notNull().defaultTo(0))
    .execute()

  await db.schema
    .createIndex('crm_contact_channels_record_channel_field_uniq')
    .on('crm_contact_channels')
    .columns(['record_id', 'channel_id', 'field_key'])
    .unique()
    .execute()

  // At most one primary link per field per record.
  await sql`
    CREATE UNIQUE INDEX crm_contact_channels_primary_uniq
      ON crm_contact_channels (record_id, field_key)
      WHERE is_primary
  `.execute(db)

  // "Which records link this channel" — dedupe views and channel erasure.
  await db.schema
    .createIndex('crm_contact_channels_channel_idx')
    .on('crm_contact_channels')
    .column('channel_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('crm_contact_channels').execute()
  await db.schema.dropTable('crm_channels').execute()
  await db.schema.dropTable('crm_channel_types').execute()
}
