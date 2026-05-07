import type { H3Event } from 'h3'
import { db } from './database'
import { ROLES, STATIC_ROLE_NAMES, getStaticRole } from '#core/app/utils/role-definitions'
import type { Permission } from '#core/app/utils/permissions'

export async function getUserRoles(userId: string): Promise<string[]> {
  const row = await db
    .selectFrom('users')
    .select('roles')
    .where('id', '=', userId)
    .executeTakeFirst()

  return row?.roles ?? []
}

export async function getRolePermissions(roleNames: readonly string[]): Promise<Set<Permission>> {
  const set = new Set<Permission>()
  for (const roleName of roleNames) {
    const staticRole = getStaticRole(roleName)
    if (!staticRole) continue
    for (const perm of staticRole.permissions) set.add(perm)
  }
  return set
}

export async function getUserPermissions(userId: string): Promise<Set<Permission>> {
  const roles = await getUserRoles(userId)
  return getRolePermissions(roles)
}

export async function userHasRole(userId: string, roleName: string): Promise<boolean> {
  const roles = await getUserRoles(userId)
  return roles.includes(roleName)
}

export async function userHasPermission(userId: string, permission: Permission): Promise<boolean> {
  const perms = await getUserPermissions(userId)
  return perms.has(permission)
}

export async function requireRole(_event: H3Event, roleName: string): Promise<never> {
  throw createError({ statusCode: 501, statusMessage: `requireRole not implemented in fixture (asked for ${roleName})` })
}

export async function requirePermission(_event: H3Event, permission: Permission): Promise<never> {
  throw createError({ statusCode: 501, statusMessage: `requirePermission not implemented in fixture (asked for ${permission})` })
}

export async function validateRoleNames(roles: string[]): Promise<{ valid: boolean; unknown: string[] }> {
  const known = new Set<string>(STATIC_ROLE_NAMES)
  const unknown = roles.filter(r => !known.has(r))
  return { valid: unknown.length === 0, unknown }
}

export { ROLES, STATIC_ROLE_NAMES }
