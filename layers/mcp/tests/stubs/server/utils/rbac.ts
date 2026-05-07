// Test stub for ~~/server/utils/rbac. Tests can override `setUserPermissions`
// to control what the dispatcher sees per request.
import type { Permission } from '../../app/utils/permissions'

const _userPerms = new Map<string, Set<Permission>>()

export function setUserPermissions(userId: string, perms: Permission[]): void {
  _userPerms.set(userId, new Set(perms))
}

export function clearUserPermissions(): void {
  _userPerms.clear()
}

export async function getUserPermissions(userId: string): Promise<Set<Permission>> {
  return _userPerms.get(userId) ?? new Set()
}

export async function userHasPermission(userId: string, permission: Permission): Promise<boolean> {
  const perms = await getUserPermissions(userId)
  return perms.has(permission)
}
