import { registerPermissions } from '#core/server/utils/permissions-registry'
import { registerDefaultGrants } from '#core/server/utils/default-grants-registry'
import { registerApp } from '#core/server/utils/app-registry'
import { registerNavItem } from '#core/server/utils/nav-registry'
import { GMAIL_PERMISSIONS, GMAIL_PERMISSION_META, GMAIL_DEFAULT_GRANTS } from '../../app/utils/permissions'

// Single owner of all gmail boot registrations.
export default defineNitroPlugin(() => {
  registerPermissions(GMAIL_PERMISSIONS, GMAIL_PERMISSION_META)
  registerDefaultGrants('gmail', GMAIL_DEFAULT_GRANTS)

  registerApp({
    id: 'gmail',
    title: 'Gmail',
    path: '/gmail',
    icon: 'i-lucide-mail',
    requiredPermission: 'gmail.access',
    order: 36
  })
  registerNavItem({
    appId: 'gmail',
    title: 'Mail',
    path: '/gmail',
    icon: 'i-lucide-inbox',
    requiredPermission: 'gmail.access',
    order: 10
  })
  registerNavItem({
    appId: 'gmail',
    title: 'Accounts',
    path: '/gmail/settings',
    icon: 'i-lucide-settings',
    requiredPermission: 'gmail.access',
    order: 90
  })
})
