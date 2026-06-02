export const FEEDBACK_PERMISSIONS = [
  'feedback.access',
  'feedback.read',
  'feedback.write',
  'feedback.triage'
] as const

export type FeedbackPermission = typeof FEEDBACK_PERMISSIONS[number]

export const FEEDBACK_PERMISSION_META: Record<string, { title: string, description: string }> = {
  'feedback.access': {
    title: 'Access Feedback',
    description: 'Required to open the Feedback app.'
  },
  'feedback.read': {
    title: 'Read feedback boards',
    description: 'View projects, swimlanes, and cards.'
  },
  'feedback.write': {
    title: 'Edit feedback boards',
    description: 'Create, edit, and move cards, projects, and swimlanes.'
  },
  'feedback.triage': {
    title: 'Triage feedback submissions',
    description: 'Update status, admin notes, and external references on feedback cards.'
  }
}

export const FEEDBACK_DEFAULT_GRANTS: Record<'member' | 'admin', FeedbackPermission[]> = {
  member: ['feedback.access', 'feedback.read', 'feedback.write'],
  admin: [...FEEDBACK_PERMISSIONS]
}

declare module '#permissions' {
  interface PermissionRegistry extends Record<FeedbackPermission, true> {}
}
