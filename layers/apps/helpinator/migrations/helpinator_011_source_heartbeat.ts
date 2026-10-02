import type { Kysely } from 'kysely'

// Touched on every progress write of a crawl. A `syncing` source whose
// heartbeat has gone quiet belonged to a process that died mid-run (restart,
// deploy); readers mark it interrupted instead of showing it syncing forever.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('helpinator_library_sources')
    .addColumn('run_heartbeat_at', 'timestamptz')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('helpinator_library_sources').dropColumn('run_heartbeat_at').execute()
}
