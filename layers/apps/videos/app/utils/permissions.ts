export const VIDEOS_PERMISSIONS = [
  'videos.access',
  'videos.read',
  'videos.write',
  'videos.moderate'
] as const

export type VideosPermission = typeof VIDEOS_PERMISSIONS[number]

export const VIDEOS_PERMISSION_META: Record<string, { title: string, description: string }> = {
  'videos.access': {
    title: 'Access Videos',
    description: 'Required to open the Videos app.'
  },
  'videos.read': {
    title: 'Read videos',
    description: 'View org-shared videos in the team library.'
  },
  'videos.write': {
    title: 'Manage own videos',
    description: 'Upload, edit, delete, and change visibility on your own videos.'
  },
  'videos.moderate': {
    title: 'Moderate videos',
    description: 'Edit, delete, or re-share any video in the org.'
  }
}

export const VIDEOS_DEFAULT_GRANTS: Record<'member' | 'admin', VideosPermission[]> = {
  member: ['videos.access', 'videos.read', 'videos.write'],
  admin: [...VIDEOS_PERMISSIONS]
}

declare module '#permissions' {
  interface PermissionRegistry extends Record<VideosPermission, true> {}
}
