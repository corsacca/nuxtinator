export const FILES_PERMISSIONS = [
  'files.access',
  'files.read',
  'files.write',
  'files.delete'
] as const

export type FilesPermission = typeof FILES_PERMISSIONS[number]

export const FILES_PERMISSION_META: Record<string, { title: string, description: string }> = {
  'files.access': {
    title: 'Access Files',
    description: 'Required to open the Files app.'
  },
  'files.read': {
    title: 'Read files',
    description: 'View and download documents and files.'
  },
  'files.write': {
    title: 'Create & edit files',
    description: 'Upload files, create and edit documents, manage tags and share links.'
  },
  'files.delete': {
    title: 'Delete files',
    description: 'Delete documents and files.'
  }
}

export const FILES_DEFAULT_GRANTS: Record<'member' | 'admin', FilesPermission[]> = {
  member: ['files.access', 'files.read', 'files.write'],
  admin: [...FILES_PERMISSIONS]
}

declare module '#permissions' {
  interface PermissionRegistry extends Record<FilesPermission, true> {}
}
