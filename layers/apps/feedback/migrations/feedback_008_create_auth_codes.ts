import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// Short-lived, single-use authorization codes for the widget sign-in redirect
// flow. The widget redirects the user to the host's connect page; once the host
// session is confirmed, a code is minted here bound to {user, project, redirect
// origin, PKCE challenge} and handed back to the embedding site, which exchanges
// it at /api/v1/feedback/token for the encrypted access token stored here.
//
// Single-use is enforced by deleting the row on exchange (DELETE … RETURNING),
// so there's no `used` flag — presence means unclaimed. Codes that are minted
// but never exchanged are reaped by the expiry sweep in
// server/plugins/feedback-cleanup.ts (the reason for the `expires` index).
//
// Not tenant-scoped: rows are ephemeral, keyed by a high-entropy hash, and the
// token-exchange endpoint looks a code up by hash with no org context (it can't
// know the org before reading the row). The project_id FK still ties each code
// to its project for cascade cleanup.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('feedback_auth_codes')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('code_hash', 'text', col => col.notNull().unique())
    .addColumn('user_id', 'text', col => col.notNull())
    .addColumn('project_id', 'uuid', col =>
      col.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('redirect_origin', 'text', col => col.notNull())
    .addColumn('code_challenge', 'text', col => col.notNull())
    .addColumn('token_ciphertext', 'text', col => col.notNull())
    .addColumn('expires', 'timestamptz', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('feedback_auth_codes_expires_idx')
    .on('feedback_auth_codes')
    .column('expires')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('feedback_auth_codes').ifExists().execute()
}
