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

export const FEEDBACK_DEFAULT_GRANTS = {
  member: ['feedback.access', 'feedback.read', 'feedback.write'],
  admin: [...FEEDBACK_PERMISSIONS]
} as const

declare module '#permissions' {
  interface PermissionRegistry {
    'feedback.access': true
    'feedback.read': true
    'feedback.write': true
    'feedback.triage': true
  }
}
