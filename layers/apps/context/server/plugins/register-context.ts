import { registerPermissions } from '#core/server/utils/permissions-registry'
import { registerDefaultGrants } from '#core/server/utils/default-grants-registry'
import { registerApp } from '#core/server/utils/app-registry'
import { registerNavItem } from '#core/server/utils/nav-registry'
import {
  CONTEXT_PERMISSIONS,
  CONTEXT_PERMISSION_META,
  CONTEXT_DEFAULT_GRANTS
} from '../../app/utils/permissions'

export default defineNitroPlugin(() => {
  registerPermissions(CONTEXT_PERMISSIONS, CONTEXT_PERMISSION_META)
  registerDefaultGrants('context', CONTEXT_DEFAULT_GRANTS)

  registerApp({
    id: 'context',
    title: 'Context',
    path: '/context',
    icon: 'i-lucide-book-open-text',
    requiredPermission: 'context.access',
    order: 25
  })

  registerNavItem({
    appId: 'context',
    title: 'Portfolios',
    path: '/context',
    icon: 'i-lucide-folder-open',
    requiredPermission: 'context.read',
    order: 10
  })
})
