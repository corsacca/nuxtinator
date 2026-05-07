// App-static role registry. App layers ship role bundles that travel with
// the code via `registerStaticRole(...)`. Resolution order in
// `getRolePermissions(roleName)`:
//
//   host-static (`app/utils/role-definitions.ts`)
//   app-static  (this registry)
//   custom      (`custom_roles` DB table, filtered by isRegisteredPermission)
//
// `key` is the stable identifier stored in `users.roles[]`. `source` is
// the originating app id, used for "Mail Admin (from Mail)" in admin UI
// and to drop the role from assignable lists when the layer is gone.

import { getStaticRole as getHostStaticRole, STATIC_ROLES as HOST_STATIC_ROLES, type RoleDefinition } from '#core/app/utils/role-definitions'

export interface AppStaticRole {
  key: string
  name: string
  description: string
  permissions: ReadonlyArray<string>
  source: string
}

export interface UnifiedStaticRole {
  key: string
  name: string
  description: string
  permissions: ReadonlyArray<string>
  source: string // 'host' for host-static, app id for app-static
}

const _appRoles = new Map<string, AppStaticRole>()

export function registerStaticRole(role: AppStaticRole): void {
  if (!role || typeof role.key !== 'string' || role.key.length === 0) return
  _appRoles.set(role.key, role)
}

export function getAppStaticRole(name: string): AppStaticRole | null {
  return _appRoles.get(name) ?? null
}

// Looks up a role by name across host-static + app-static. Host wins on
// collision (host-static role names are reserved).
export function getStaticRole(name: string): RoleDefinition | AppStaticRole | null {
  const host = getHostStaticRole(name)
  if (host) return host
  return _appRoles.get(name) ?? null
}

export function getAllStaticRoles(): UnifiedStaticRole[] {
  const out: UnifiedStaticRole[] = []
  for (const r of HOST_STATIC_ROLES) {
    out.push({
      key: r.key,
      name: r.name,
      description: r.description,
      permissions: r.permissions as readonly string[],
      source: 'host'
    })
  }
  for (const r of _appRoles.values()) {
    if (HOST_STATIC_ROLES.some(h => h.key === r.key)) continue
    out.push({
      key: r.key,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      source: r.source
    })
  }
  return out
}

export function getAppStaticRoleNames(): string[] {
  return [..._appRoles.keys()]
}

export function __resetRolesRegistryForTests(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetRolesRegistryForTests is not callable in production')
  }
  _appRoles.clear()
}
