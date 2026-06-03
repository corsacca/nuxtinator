export const EXAMPLE_PERMISSIONS = [
  'example.access',
  'example.read',
  'example.write'
] as const

export type ExamplePermission = typeof EXAMPLE_PERMISSIONS[number]

export const EXAMPLE_PERMISSION_META: Record<string, { title: string, description: string }> = {
  'example.access': {
    title: 'Access Example',
    description: 'Required to open the Example app.'
  },
  'example.read': {
    title: 'Read example',
    description: 'View example data.'
  },
  'example.write': {
    title: 'Edit example',
    description: 'Create, edit, and delete example data.'
  }
}

export const EXAMPLE_DEFAULT_GRANTS: Record<'member' | 'admin', ExamplePermission[]> = {
  member: ['example.access', 'example.read'],
  admin: [...EXAMPLE_PERMISSIONS]
}

declare module '#permissions' {
  interface PermissionRegistry extends Record<ExamplePermission, true> {}
}
