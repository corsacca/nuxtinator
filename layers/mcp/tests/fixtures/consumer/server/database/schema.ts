// Fixture Database interface. The OAuth layer's schema.d.ts module-augments
// this interface with its six oauth_* tables, so we only declare the
// fixture-owned tables (users, activity_logs) here.
import type { ColumnType, Generated } from 'kysely'

export interface UsersTable {
  id: Generated<string>
  email: string
  password_hash: string | null
  display_name: string | null
  verified: Generated<boolean>
  roles: Generated<string[]>
  created: ColumnType<Date, Date | string | undefined, Date | string>
  updated: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface ActivityLogsTable {
  id: Generated<string>
  timestamp: Generated<Date>
  event_type: string
  table_name: string | null
  record_id: string | null
  user_id: string | null
  user_agent: string | null
  metadata: Generated<Record<string, unknown>>
}

export interface Database {
  users: UsersTable
  activity_logs: ActivityLogsTable
}
