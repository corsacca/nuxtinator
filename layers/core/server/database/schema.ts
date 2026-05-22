import type { ColumnType, Generated } from 'kysely'

export interface UsersTable {
  id: Generated<string>
  created: ColumnType<Date, string | undefined, string>
  updated: ColumnType<Date, string | undefined, string>
  email: string
  display_name: string
  avatar: Generated<string>
  password: ColumnType<string | null, string | null | undefined, string | null>
  verified: Generated<boolean>
  is_admin: Generated<boolean>
  roles: Generated<string[]>
  token_key: Generated<string>
  token_expires_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  pending_email: string | null
  email_change_token: string | null
}

export interface PasswordResetRequestsTable {
  id: Generated<string>
  created: ColumnType<Date, Date | string | undefined, Date | string>
  expires: ColumnType<Date, Date | string, Date | string>
  user_id: string
  token: string
  used: Generated<boolean>
}

export interface ActivityLogsTable {
  id: Generated<string>
  timestamp: ColumnType<Date, Date | string | undefined, Date | string>
  event_type: string
  table_name: string | null
  record_id: string | null
  user_id: string | null
  user_agent: string | null
  metadata: Generated<Record<string, unknown>>
}

export interface CustomRolesTable {
  id: Generated<string>
  created: ColumnType<Date, string | undefined, string>
  updated: ColumnType<Date, string | undefined, string>
  name: string
  description: Generated<string>
  permissions: Generated<string[]>
}

export type AppStatus = 'disabled' | 'available' | 'default'

export interface AppsTable {
  id: string
  status: Generated<AppStatus>
  created_at: ColumnType<Date, string | undefined, string>
  updated_at: ColumnType<Date, string | undefined, string>
}

export type NotificationEmailMode = 'immediate' | 'digest' | 'none'

export interface NotificationsTable {
  id: Generated<string>
  user_id: string
  app_id: string
  title: string
  body: string | null
  icon: string | null
  link: string
  actor_id: string | null
  email_mode: Generated<NotificationEmailMode>
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  read_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  emailed_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
}

export interface Database {
  users: UsersTable
  password_reset_requests: PasswordResetRequestsTable
  activity_logs: ActivityLogsTable
  custom_roles: CustomRolesTable
  apps: AppsTable
  notifications: NotificationsTable
}
