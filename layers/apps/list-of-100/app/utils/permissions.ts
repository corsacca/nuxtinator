// Compile-time + runtime permissions for the List of 100 app.
//
// Three permissions:
//   - list-of-100.access: launcher tile visibility gate.
//   - list-of-100.read:   view your own list (own-only enforced in handlers).
//   - list-of-100.write:  create/edit/delete contacts on your own list.
//
// All three are granted to org members by default. Owner-only visibility is
// enforced inside each route handler by filtering `where user_id = ctx.userId`.

export const LIST_OF_100_PERMISSIONS = [
  'list-of-100.access',
  'list-of-100.read',
  'list-of-100.write'
] as const

export type ListOf100Permission = typeof LIST_OF_100_PERMISSIONS[number]

export const LIST_OF_100_PERMISSION_META: Record<string, { title: string, description: string }> = {
  'list-of-100.access': {
    title: 'Access List of 100',
    description: 'Required to open the List of 100 app.'
  },
  'list-of-100.read': {
    title: 'Read your List of 100',
    description: 'View your own contacts and progress.'
  },
  'list-of-100.write': {
    title: 'Edit your List of 100',
    description: 'Add, edit, delete contacts and mark contacted / prayed.'
  }
}

export const LIST_OF_100_DEFAULT_GRANTS = {
  member: ['list-of-100.access', 'list-of-100.read', 'list-of-100.write'],
  admin: [...LIST_OF_100_PERMISSIONS]
} as const

declare module '#permissions' {
  interface PermissionRegistry {
    'list-of-100.access': true
    'list-of-100.read': true
    'list-of-100.write': true
  }
}
