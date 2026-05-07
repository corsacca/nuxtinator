import type { Permission } from './permissions'

export interface RoleDefinition {
  name: string
  description: string
  permissions: readonly Permission[]
}

// Host static roles. The host itself ships none — `users.is_admin` is the
// only operator gate, with no permission slug. Layers add their own static
// roles via `registerStaticRole(...)`. The tenancy layer adds org-scoped
// `admin` and `member` roles.
export const ROLES = {} as const satisfies Record<string, RoleDefinition>

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
