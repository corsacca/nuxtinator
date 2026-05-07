import { type Kysely, sql } from 'kysely'

// Multi-tenant deploys split DB access into two roles:
//   host_admin (BYPASSRLS) — used by migrations + adminDb
//   app_user                — used by the application's `db` client (RLS-enforced)
//
// Grants are configured here so future tables created by migrations
// automatically grant access to app_user.
//
// CREATE ROLE / passwords are out of scope for migrations — they're done
// once at provisioning time (see documentation/tenancy.md). This migration
// just wires up the GRANTs, which are idempotent and safe to re-run.
export async function up(db: Kysely<unknown>): Promise<void> {
  // No-op if app_user doesn't exist (single-tenant deploys that decide to
  // turn the layer on later need to provision the role first).
  await sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT USAGE ON SCHEMA public TO app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
        EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE ' || current_user || '
                 IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE
                 ON TABLES TO app_user';
        EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE ' || current_user || '
                 IN SCHEMA public GRANT USAGE, SELECT
                 ON SEQUENCES TO app_user';
      END IF;
    END
    $$;
  `.execute(db)
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Intentionally a no-op. We don't revoke role grants in a down-migration —
  // that could lock out an active deploy if run accidentally.
}
