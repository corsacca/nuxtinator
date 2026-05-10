import { type Kysely, sql } from 'kysely'

// Per-app tenancy migration. Filename suffix `_T001_` makes the migrations
// runner only include this when the tenancy layer is loaded. Adds `org_id`
// to `videos`, enables RLS, and installs two policies: one that lets public
// videos be read across orgs (so unauthenticated `/watch/:token` works
// without setting the GUC), and one that scopes writes to the active org.
//
// Also replaces the single-tenant `bump_video_counter` with a SECURITY
// DEFINER variant — the public-share counter endpoints update from a
// no-GUC context, which would be blocked by the write policy otherwise.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE videos
      ADD COLUMN org_id uuid NOT NULL DEFAULT current_org_id()
        REFERENCES orgs(id) ON DELETE CASCADE
  `.execute(db)
  await sql`ALTER TABLE videos ENABLE ROW LEVEL SECURITY`.execute(db)

  await sql`
    CREATE POLICY videos_tenant_read ON videos FOR SELECT
      USING (
        org_id = nullif(current_setting('app.current_org', true), '')::uuid
        OR visibility = 'public'
      )
  `.execute(db)

  await sql`
    CREATE POLICY videos_tenant_write ON videos FOR ALL
      USING       (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
      WITH CHECK  (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION bump_video_counter(p_token text, p_kind text)
    RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      IF p_kind NOT IN ('play', 'view') THEN
        RAISE EXCEPTION 'invalid kind';
      END IF;
      IF p_kind = 'play' THEN
        UPDATE videos SET play_count = play_count + 1
          WHERE share_token = p_token AND visibility = 'public';
      ELSE
        UPDATE videos SET view_count = view_count + 1
          WHERE share_token = p_token AND visibility = 'public';
      END IF;
    END $$
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Restore the non-SECURITY-DEFINER variant for any single-tenant restore.
  await sql`
    CREATE OR REPLACE FUNCTION bump_video_counter(p_token text, p_kind text)
    RETURNS void
    LANGUAGE plpgsql AS $$
    BEGIN
      IF p_kind NOT IN ('play', 'view') THEN
        RAISE EXCEPTION 'invalid kind';
      END IF;
      IF p_kind = 'play' THEN
        UPDATE videos SET play_count = play_count + 1
          WHERE share_token = p_token AND visibility = 'public';
      ELSE
        UPDATE videos SET view_count = view_count + 1
          WHERE share_token = p_token AND visibility = 'public';
      END IF;
    END $$
  `.execute(db)
  await sql`DROP POLICY IF EXISTS videos_tenant_write ON videos`.execute(db)
  await sql`DROP POLICY IF EXISTS videos_tenant_read ON videos`.execute(db)
  await sql`ALTER TABLE videos DISABLE ROW LEVEL SECURITY`.execute(db)
  await sql`ALTER TABLE videos DROP COLUMN org_id`.execute(db)
}
