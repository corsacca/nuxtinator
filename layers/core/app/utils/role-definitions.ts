import type { Permission } from './permissions'

export interface RoleDefinition {
  name: string
  description: string
  permissions: readonly Permission[]
}

// Host static roles. `users.is_admin` is the operator gate (no permission
// slug); `admin` is special-cased in `getRolePermissions` to mean "every
// registered permission" so it's not listed here. `member` is the universal
// "basic authenticated access" role used as the default for invited users in
// both single and multi-tenant deploys. Layers add additional static roles
// via `registerStaticRole(...)`.
export const ROLES = {
  member: {
    name: 'Member',
    description: 'Basic authenticated access.',
    permissions: []
  }
} as const satisfies Record<string, RoleDefinition>

export type StaticRoleName = keyof typeof ROLES

export const STATIC_ROLE_NAMES = Object.keys(ROLES) as StaticRoleName[]

export type StaticRoleEntry = RoleDefinition & { key: StaticRoleName }

export const STATIC_ROLES: readonly StaticRoleEntry[] = (
  Object.entries(ROLES) as [StaticRoleName, RoleDefinition][]
).map(([key, def]) => ({ key, ...def }))

export function getStaticRole(name: string): RoleDefinition | null {
  return (ROLES as Record<string, RoleDefinition>)[name] ?? null
}

export function isStaticRole(name: string): name is StaticRoleName {
  return name in ROLES
}
