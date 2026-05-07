// Central permission registry.
//
// Each app layer ships a permissions block and augments `PermissionRegistry`
// via the `#permissions` module alias:
//
//   declare module '#permissions' {
//     interface PermissionRegistry extends Record<MailPermission, true> {}
//   }
//
// TypeScript merges interfaces at compile time, so `Permission` widens
// automatically as layers are installed. The runtime parallel — strings the
// server actually treats as registered at request time — lives in
// `server/utils/permissions-registry.ts` and is fed by each layer's Nitro
// plugin via `registerPermissions(...)`.
//
// Prefer granular permissions (e.g. `pages.read`, `pages.write`) over coarse
// ones (e.g. `pages.manage`). Compose breadth via roles. OAuth scopes use the
// same vocabulary, so granular saves a parallel scope→permission map.
//
// The host owns no permissions of its own — operator-admin is the
// `users.is_admin` boolean (no permission slug). When the tenancy layer is
// loaded it adds an `org.*` permission family for org-scoped administration.

export const PERMISSIONS = [] as const

// Open registry — host has no permissions of its own. Layers extend via
// `declare module '#permissions'` (interface merging).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PermissionRegistry {}

export type Permission = keyof PermissionRegistry

// Compile-time membership test against the host's static `PermissionRegistry`.
// At runtime, layers register additional permissions through
// `permissions-registry.ts` (`isRegisteredPermission()`); callers that need
// the runtime view should use that instead.
export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value)
}

export const PERMISSION_META: Record<string, { title: string, description: string }> = {}
