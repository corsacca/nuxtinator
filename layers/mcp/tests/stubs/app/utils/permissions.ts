// Test stub for the consumer's app/utils/permissions.ts. Mirrors the shape
// the layer expects: a `Permission` literal-union type, a `PERMISSIONS`
// readonly tuple, and an `isPermission` type guard.

export const PERMISSIONS = [
  'admin.access',
  'pages.view',
  'pages.write',
  'pages.publish',
  'users.view',
  'users.manage'
] as const

export type Permission = typeof PERMISSIONS[number]

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value)
}
