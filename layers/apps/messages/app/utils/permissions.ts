export const MESSAGES_PERMISSIONS = [
  'messages.access',
  'messages.read',
  'messages.write',
  'messages.channel.create',
  'messages.channel.archive'
] as const

export type MessagesPermission = typeof MESSAGES_PERMISSIONS[number]

export const MESSAGES_PERMISSION_META: Record<string, { title: string, description: string }> = {
  'messages.access': {
    title: 'Access Messages',
    description: 'Required to open the Messages app.'
  },
  'messages.read': {
    title: 'Read messages',
    description: 'View channels, DMs, items, and comments.'
  },
  'messages.write': {
    title: 'Post messages',
    description: 'Post items, comments, replies, and reactions.'
  },
  'messages.channel.create': {
    title: 'Create channels',
    description: 'Create new public channels in the org.'
  },
  'messages.channel.archive': {
    title: 'Archive channels',
    description: 'Archive existing channels.'
  }
}

export const MESSAGES_DEFAULT_GRANTS = {
  member: ['messages.access', 'messages.read', 'messages.write', 'messages.channel.create'],
  admin: [...MESSAGES_PERMISSIONS]
} as const

declare module '#permissions' {
  interface PermissionRegistry {
    'messages.access': true
    'messages.read': true
    'messages.write': true
    'messages.channel.create': true
    'messages.channel.archive': true
  }
}
