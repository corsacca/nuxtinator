export const CRM_PERMISSIONS = [
  'crm.access',
  // Granular slugs for the code-declared contacts type.
  'crm.contacts.read',
  'crm.contacts.create',
  'crm.contacts.update',
  'crm.contacts.delete',
  'crm.contacts.share',
  'crm.contacts.view_all',
  // Generic slugs covering every admin-created record type. Runtime types
  // cannot mint permission slugs (the registry is code-owned), so they all
  // share this set.
  'crm.records.read',
  'crm.records.create',
  'crm.records.update',
  'crm.records.delete',
  'crm.records.share',
  'crm.records.view_all',
  // Org-level schema builder (record types, fields, channel types).
  'crm.schema.manage'
] as const

export type CrmPermission = typeof CRM_PERMISSIONS[number]

export const CRM_PERMISSION_META: Record<string, { title: string, description: string }> = {
  'crm.access': {
    title: 'Access CRM',
    description: 'Required to open the CRM app.'
  },
  'crm.contacts.read': {
    title: 'View contacts',
    description: 'View contact records assigned or shared to you.'
  },
  'crm.contacts.create': {
    title: 'Create contacts',
    description: 'Create new contact records.'
  },
  'crm.contacts.update': {
    title: 'Edit contacts',
    description: 'Edit contact fields, channels, and consent.'
  },
  'crm.contacts.delete': {
    title: 'Delete contacts',
    description: 'Permanently delete contact records.'
  },
  'crm.contacts.share': {
    title: 'Share contacts',
    description: 'Share contact records with other users.'
  },
  'crm.contacts.view_all': {
    title: 'View all contacts',
    description: 'See every contact record, not just assigned or shared ones.'
  },
  'crm.records.read': {
    title: 'View custom records',
    description: 'View records of admin-created types assigned or shared to you.'
  },
  'crm.records.create': {
    title: 'Create custom records',
    description: 'Create records of admin-created types.'
  },
  'crm.records.update': {
    title: 'Edit custom records',
    description: 'Edit records of admin-created types.'
  },
  'crm.records.delete': {
    title: 'Delete custom records',
    description: 'Permanently delete records of admin-created types.'
  },
  'crm.records.share': {
    title: 'Share custom records',
    description: 'Share records of admin-created types with other users.'
  },
  'crm.records.view_all': {
    title: 'View all custom records',
    description: 'See every record of admin-created types, not just assigned or shared ones.'
  },
  'crm.schema.manage': {
    title: 'Manage CRM schema',
    description: 'Create and customize record types, fields, and channel types.'
  }
}

export const CRM_DEFAULT_GRANTS: Record<'member' | 'admin', CrmPermission[]> = {
  member: [
    'crm.access',
    'crm.contacts.read',
    'crm.contacts.create',
    'crm.contacts.update',
    'crm.contacts.share',
    'crm.records.read',
    'crm.records.create',
    'crm.records.update',
    'crm.records.share'
  ],
  admin: [...CRM_PERMISSIONS]
}

declare module '#permissions' {
  interface PermissionRegistry extends Record<CrmPermission, true> {}
}
