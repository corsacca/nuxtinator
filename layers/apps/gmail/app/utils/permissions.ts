export const GMAIL_PERMISSIONS = [
  // Open the app. Every row a user can see or touch is their own; there is
  // no read/write split because the mailbox belongs to the requesting user.
  'gmail.access'
] as const

export type GmailPermission = typeof GMAIL_PERMISSIONS[number]

export const GMAIL_PERMISSION_META: Record<string, { title: string, description: string }> = {
  'gmail.access': {
    title: 'Access Gmail',
    description: 'Connect personal Gmail accounts and read, triage, snooze, and send mail from them.'
  }
}

// Personal mailboxes are opt-in: admins get it, members are granted via a role
// or per-user grant.
export const GMAIL_DEFAULT_GRANTS: Record<'member' | 'admin', GmailPermission[]> = {
  member: [],
  admin: [...GMAIL_PERMISSIONS]
}

declare module '#permissions' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface PermissionRegistry extends Record<GmailPermission, true> {}
}
