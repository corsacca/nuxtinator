import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('videos')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('title', 'text')
    .addColumn('s3_key', 'text', col => col.notNull())
    .addColumn('thumbnail_url', 'text')
    .addColumn('duration', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('file_size', 'bigint')
    .addColumn('width', 'integer')
    .addColumn('height', 'integer')
    .addColumn('share_token', 'text', col => col.notNull().unique())
    .addColumn('visibility', 'text', col =>
      col.notNull().defaultTo('private').check(sql`visibility IN ('private', 'org', 'public')`))
    .addColumn('view_count', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('play_count', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('source', 'text')
    .addColumn('original_filename', 'text')
    .addColumn('original_file_size', 'bigint')
    .addColumn('compression_ratio', 'numeric')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema.createIndex('videos_user_id_idx').on('videos').column('user_id').execute()
  await db.schema.createIndex('videos_share_token_idx').on('videos').column('share_token').execute()
  await db.schema.createIndex('videos_visibility_idx').on('videos').column('visibility').execute()

  // Single-tenant counter bump. The tenancy retrofit replaces this with a
  // SECURITY DEFINER variant that bypasses RLS for the public-share path.
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
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP FUNCTION IF EXISTS bump_video_counter(text, text)`.execute(db)
  await db.schema.dropTable('videos').execute()
}
