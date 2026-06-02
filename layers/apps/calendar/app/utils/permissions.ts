export const CALENDAR_PERMISSIONS = [
  'calendar.access',
  'calendar.read',
  'calendar.write'
] as const

export type CalendarPermission = typeof CALENDAR_PERMISSIONS[number]

export const CALENDAR_PERMISSION_META: Record<string, { title: string, description: string }> = {
  'calendar.access': {
    title: 'Access Calendar',
    description: 'Required to open the Calendar app.'
  },
  'calendar.read': {
    title: 'Read calendar',
    description: 'View events and schedules.'
  },
  'calendar.write': {
    title: 'Edit calendar',
    description: 'Create, edit, and delete events.'
  }
}

export const CALENDAR_DEFAULT_GRANTS: Record<'member' | 'admin', CalendarPermission[]> = {
  member: ['calendar.access', 'calendar.read'],
  admin: [...CALENDAR_PERMISSIONS]
}

declare module '#permissions' {
  interface PermissionRegistry extends Record<CalendarPermission, true> {}
}
