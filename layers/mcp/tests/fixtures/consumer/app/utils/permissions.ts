// Fixture PERMISSIONS catalog. Tests register tools with these scopes.
export const PERMISSIONS = [
  'admin.access',
  'pages.view',
  'pages.write',
  'pages.publish',
  'users.view',
  'users.manage'
] as const

export type Permission = typeof PERMISSIONS[number]

export const PERMISSION_META: Record<string, { title: string; description: string }> = {
  'admin.access': { title: 'Admin', description: 'Admin' },
  'pages.view': { title: 'View pages', description: 'View pages' },
  'pages.write': { title: 'Write pages', description: 'Write pages' },
  'pages.publish': { title: 'Publish pages', description: 'Publish pages' },
  'users.view': { title: 'View users', description: 'View users' },
  'users.manage': { title: 'Manage users', description: 'Manage users' }
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value)
}
