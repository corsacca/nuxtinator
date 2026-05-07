export const KANBAN_PERMISSIONS = [
  'kanban.access',
  'kanban.read',
  'kanban.write'
] as const

export type KanbanPermission = typeof KANBAN_PERMISSIONS[number]

export const KANBAN_PERMISSION_META: Record<string, { title: string, description: string }> = {
  'kanban.access': {
    title: 'Access Kanban',
    description: 'Required to open the Kanban app.'
  },
  'kanban.read': {
    title: 'Read kanban boards',
    description: 'View boards and cards.'
  },
  'kanban.write': {
    title: 'Edit kanban boards',
    description: 'Create, edit, and move cards.'
  }
}

export const KANBAN_DEFAULT_GRANTS = {
  member: ['kanban.access', 'kanban.read'],
  admin: [...KANBAN_PERMISSIONS]
} as const

declare module '#permissions' {
  interface PermissionRegistry {
    'kanban.access': true
    'kanban.read': true
    'kanban.write': true
  }
}
