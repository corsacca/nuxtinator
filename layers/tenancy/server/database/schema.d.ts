// Tenancy layer schema augmentation. Adds the org/membership/app-enable
// tables to the host's `Database` interface via Kysely module augmentation.
// Pulled into the host's compile when the tenancy layer is in `extends:`.
import type { ColumnType, Generated } from 'kysely'

export interface OrgsTable {
  id: Generated<string>
  slug: string
  name: string
  suspended_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  created_at: ColumnType<Date, string | undefined, string>
  updated_at: ColumnType<Date, string | undefined, string>
}

export interface MembershipsTable {
  id: Generated<string>
  user_id: string
  org_id: string
  roles: Generated<string[]>
  created_at: ColumnType<Date, string | undefined, string>
  updated_at: ColumnType<Date, string | undefined, string>
}

export type OrgAppSource = 'auto' | 'org_admin' | 'host'

export interface OrgAppsTable {
  org_id: string
  app_id: string
  enabled: boolean
  source: OrgAppSource
  updated_at: ColumnType<Date, string | undefined, string>
}

export type OrgRoleOverrideEffect = 'grant' | 'revoke'

export interface OrgRoleOverridesTable {
  org_id: string
  role_name: string
  permission: string
  effect: OrgRoleOverrideEffect
  created_at: ColumnType<Date, string | undefined, string>
  updated_at: ColumnType<Date, string | undefined, string>
}

declare module '#core/server/database/schema' {
  interface Database {
    orgs: OrgsTable
    memberships: MembershipsTable
    org_apps: OrgAppsTable
    org_role_overrides: OrgRoleOverridesTable
  }

  // The tenancy layer also retrofits `org_id` onto two existing host tables;
  // declare the column here so TS knows about it inside the layer's code.
  interface CustomRolesTable {
    org_id: string
  }

  interface ActivityLogsTable {
    org_id: string | null
  }
}
