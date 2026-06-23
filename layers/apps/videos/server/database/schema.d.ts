// Adds the videos table to the host schema by merging into core's global
// `NuxtinatorDatabaseTables` registry (resolution-independent — see core's
// server/database/schema.ts).
import type { ColumnType, Generated } from 'kysely'

export type VideoVisibility = 'private' | 'org' | 'public'

export interface VideosTable {
  id: Generated<string>
  user_id: string
  org_id: string
  title: string | null
  s3_key: string
  thumbnail_url: string | null
  duration: Generated<number>
  file_size: ColumnType<string | null, string | number | null | undefined, string | number | null>
  width: number | null
  height: number | null
  share_token: string
  visibility: Generated<VideoVisibility>
  view_count: Generated<number>
  play_count: Generated<number>
  source: string | null
  original_filename: string | null
  original_file_size: ColumnType<string | null, string | number | null | undefined, string | number | null>
  compression_ratio: ColumnType<string | null, string | number | null | undefined, string | number | null>
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

declare global {
  interface NuxtinatorDatabaseTables {
    videos: VideosTable
  }
}
