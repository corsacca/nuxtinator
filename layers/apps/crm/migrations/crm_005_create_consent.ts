import { type Kysely, sql } from 'kysely'

// Consent is keyed to the channel (the address), not the record: the same
// email opted out once is opted out for every record that links it.
// crm_channel_consents is the current state per (channel, purpose) — no row
// means unknown. crm_consent_events is the append-only compliance log; it
// outlives channel erasure (channel_id goes null, the value snapshot and
// fingerprint remain as proof).
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('crm_channel_consents')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('channel_id', 'uuid', col => col.notNull().references('crm_channels.id').onDelete('cascade'))
    .addColumn('purpose', 'text', col => col.notNull())
    .addColumn('status', 'text', col => col.notNull().check(sql`status IN ('opt_in', 'opt_out')`))
    .addColumn('granted_at', 'timestamptz')
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('source', 'text')
    .addColumn('capture_meta', 'jsonb', col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute()

  await db.schema
    .createIndex('crm_channel_consents_channel_purpose_uniq')
    .on('crm_channel_consents')
    .columns(['channel_id', 'purpose'])
    .unique()
    .execute()

  await db.schema
    .createTable('crm_consent_events')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('channel_id', 'uuid', col => col.references('crm_channels.id').onDelete('set null'))
    // Literal address at the time of the event — kept verbatim so the log
    // stays meaningful after the channel row is gone.
    .addColumn('channel_value', 'text', col => col.notNull())
    // sha256 of "kind:normalized_value" — lets erased addresses still be
    // matched against future consent lookups.
    .addColumn('address_fingerprint', 'text', col => col.notNull())
    .addColumn('purpose', 'text', col => col.notNull())
    .addColumn('event', 'text', col => col.notNull().check(sql`event IN ('grant', 'revoke')`))
    .addColumn('source', 'text')
    .addColumn('actor_user_id', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('ip', 'text')
    .addColumn('user_agent', 'text')
    .addColumn('meta', 'jsonb', col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('occurred_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await sql`
    CREATE INDEX crm_consent_events_channel_occurred_idx
      ON crm_consent_events (channel_id, occurred_at DESC)
  `.execute(db)

  await db.schema
    .createIndex('crm_consent_events_fingerprint_idx')
    .on('crm_consent_events')
    .column('address_fingerprint')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('crm_consent_events').execute()
  await db.schema.dropTable('crm_channel_consents').execute()
}
