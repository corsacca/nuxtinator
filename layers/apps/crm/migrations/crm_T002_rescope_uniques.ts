import { type Kysely } from 'kysely'

// Per-app tenancy migration; runs after crm_T001 (the zzz_ suffixing the
// migrator applies to T-files preserves numeric order within the app).
//
// RLS scopes what rows a session can SEE, but unique constraints are checked
// against ALL rows — a global unique on crm_channels(channel_type,
// normalized_value) would stop two orgs from holding the same email address.
// The uniques whose columns carry no record/channel FK (which would already
// be org-bound through the referenced row) are therefore rebuilt with org_id
// leading. Inserts that rely on these use ON CONFLICT DO NOTHING with no
// named conflict target, so the index shape can differ between single and
// multi mode.

const RESCOPES = [
  {
    table: 'crm_channels',
    globalName: 'crm_channels_type_value_uniq',
    orgName: 'crm_channels_org_type_value_uniq',
    columns: ['channel_type', 'normalized_value']
  },
  {
    table: 'crm_channel_types',
    globalName: 'crm_channel_types_type_key_uniq',
    orgName: 'crm_channel_types_org_type_key_uniq',
    columns: ['type_key']
  },
  {
    table: 'crm_record_types',
    globalName: 'crm_record_types_type_key_uniq',
    orgName: 'crm_record_types_org_type_key_uniq',
    columns: ['type_key']
  },
  {
    table: 'crm_record_fields',
    globalName: 'crm_record_fields_type_field_uniq',
    orgName: 'crm_record_fields_org_type_field_uniq',
    columns: ['type_key', 'field_key']
  }
] as const

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const { table, globalName, orgName, columns } of RESCOPES) {
    await db.schema.dropIndex(globalName).execute()
    await db.schema
      .createIndex(orgName)
      .on(table)
      .columns(['org_id', ...columns])
      .unique()
      .execute()
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const { table, globalName, orgName, columns } of [...RESCOPES].reverse()) {
    await db.schema.dropIndex(orgName).execute()
    await db.schema
      .createIndex(globalName)
      .on(table)
      .columns([...columns])
      .unique()
      .execute()
  }
}
