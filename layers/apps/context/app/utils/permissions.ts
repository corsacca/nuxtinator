export const CONTEXT_PERMISSIONS = [
  'context.access',
  'context.read',
  'context.write',
  'context.comment.resolve',
  'context.portfolio.create',
  'context.portfolio.delete',
  'context.section.custom',
  'context.assistant.chat',
  'context.assistant.apply'
] as const

export type ContextPermission = typeof CONTEXT_PERMISSIONS[number]

export const CONTEXT_PERMISSION_META: Record<string, { title: string, description: string }> = {
  'context.access': {
    title: 'Access Context',
    description: 'Required to open the Context app.'
  },
  'context.read': {
    title: 'Read portfolios',
    description: 'View portfolios, sections, comments, and version history.'
  },
  'context.write': {
    title: 'Edit sections',
    description: 'Save section content, post comments and replies.'
  },
  'context.comment.resolve': {
    title: 'Resolve comments',
    description: 'Mark comments as resolved or reopen them.'
  },
  'context.portfolio.create': {
    title: 'Create portfolios',
    description: 'Create new portfolios in this org.'
  },
  'context.portfolio.delete': {
    title: 'Delete portfolios',
    description: 'Delete portfolios and their content.'
  },
  'context.section.custom': {
    title: 'Manage custom sections',
    description: 'Add, edit, and remove custom section definitions on a portfolio.'
  },
  'context.assistant.chat': {
    title: 'Chat with assistant',
    description: 'Send messages to the portfolio AI assistant.'
  },
  'context.assistant.apply': {
    title: 'Apply assistant updates',
    description: 'Apply assistant-proposed section updates.'
  }
}

export const CONTEXT_DEFAULT_GRANTS = {
  member: [
    'context.access',
    'context.read',
    'context.write',
    'context.assistant.chat'
  ],
  admin: [...CONTEXT_PERMISSIONS]
} as const

declare module '#permissions' {
  interface PermissionRegistry {
    'context.access': true
    'context.read': true
    'context.write': true
    'context.comment.resolve': true
    'context.portfolio.create': true
    'context.portfolio.delete': true
    'context.section.custom': true
    'context.assistant.chat': true
    'context.assistant.apply': true
  }
}
