import { registerPermissions } from '#core/server/utils/permissions-registry'
import { registerDefaultGrants } from '#core/server/utils/default-grants-registry'
import { registerApp } from '#core/server/utils/app-registry'
import { registerNavItem } from '#core/server/utils/nav-registry'
import { CRM_PERMISSIONS, CRM_PERMISSION_META, CRM_DEFAULT_GRANTS } from '../../app/utils/permissions'

export default defineNitroPlugin(() => {
  registerPermissions(CRM_PERMISSIONS, CRM_PERMISSION_META)
  registerDefaultGrants('crm', CRM_DEFAULT_GRANTS)
  registerApp({
    id: 'crm',
    title: 'CRM',
    path: '/crm',
    icon: 'i-lucide-contact',
    requiredPermission: 'crm.access',
    order: 30
  })
  registerNavItem({
    appId: 'crm',
    title: 'Contacts',
    path: '/crm/contacts',
    icon: 'i-lucide-users',
    requiredPermission: 'crm.contacts.read',
    order: 10
  })
})
