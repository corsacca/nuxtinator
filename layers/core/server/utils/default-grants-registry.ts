// Default-grant registry. Each app layer declares which host static roles
// (admin, member) get which app permissions by default, e.g.
//
//   registerDefaultGrants('mail', { member: ['mail.access', 'mail.read'], admin: [...MAIL_PERMISSIONS] })
//
// `getRolePermissions` (server/utils/rbac.ts) unions these grants in as the
// fourth tier of the role-permission merge: host-static → app-static →
// custom (DB) → default grants.
//
// Apps may only auto-grant into host-static role names. Cross-app
// auto-granting (e.g. mail granting permissions into a calendar-admin role)
// is intentionally not supported — it would create an order-dependent
// install graph between layers.
//
// ## Deferred: `runtimeConfig.permissions.excludeDefaultGrants`
//
// A future deployment-side override lets operators opt out of specific
// auto-grants without forking the layer that ships them. Format (planned):
//
//   runtimeConfig: {
//     permissions: {
//       excludeDefaultGrants: ['mail.read@member', 'calendar.*@member']
//     }
//   }
//
// Each entry is `<permission>@<role>`. Wildcards in the permission half
// (`mail.*@member`) drop every grant for that app into that role.
//
// The filter would apply inside `getDefaultGrants(roleName)` (or the merge
// step in `getRolePermissions`) — just before the union returns. The
// registry data structure stays unchanged; the override list is the only
// new input.
//
// Not implemented in V3 — this comment is the design hook so the override
// is discoverable when it's actually needed.

const _grants = new Map<string, Map<string, Set<string>>>()

// Register default grants for an app. Outer key is the app id (used so we
// can re-register cleanly during dev HMR — repeat calls overwrite the same
// app's grants rather than accumulating). Inner keys are host role names.
export function registerDefaultGrants(
  appId: string,
  grants: Record<string, ReadonlyArray<string>>
): void {
  const perRole = new Map<string, Set<string>>()
  for (const [roleName, perms] of Object.entries(grants)) {
    const set = new Set<string>()
    for (const p of perms) {
      if (typeof p === 'string' && p.length > 0) set.add(p)
    }
    perRole.set(roleName, set)
  }
  _grants.set(appId, perRole)
}

// Returns the union of every app's default grants for the given host role.
// Strings only — caller (`getRolePermissions`) is responsible for dropping
// permissions that are no longer registered (the orphan filter).
export function getDefaultGrants(roleName: string): string[] {
  const out = new Set<string>()
  for (const perRole of _grants.values()) {
    const set = perRole.get(roleName)
    if (!set) continue
    for (const p of set) out.add(p)
  }
  return [...out]
}

export function getAllDefaultGrants(): Record<string, Record<string, string[]>> {
  const result: Record<string, Record<string, string[]>> = {}
  for (const [appId, perRole] of _grants.entries()) {
    const apps: Record<string, string[]> = {}
    for (const [role, set] of perRole.entries()) {
      apps[role] = [...set]
    }
    result[appId] = apps
  }
  return result
}

export function __resetDefaultGrantsForTests(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetDefaultGrantsForTests is not callable in production')
  }
  _grants.clear()
}
