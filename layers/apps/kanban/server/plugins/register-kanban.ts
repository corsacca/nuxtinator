import { registerPermissions } from '#core/server/utils/permissions-registry'
import { registerDefaultGrants } from '#core/server/utils/default-grants-registry'
import { registerApp } from '#core/server/utils/app-registry'
import { registerNavItem } from '#core/server/utils/nav-registry'
import {
  KANBAN_PERMISSIONS,
  KANBAN_PERMISSION_META,
  KANBAN_DEFAULT_GRANTS
} from '../../app/utils/permissions'

export default defineNitroPlugin(() => {
  registerPermissions(KANBAN_PERMISSIONS, KANBAN_PERMISSION_META)
  registerDefaultGrants('kanban', KANBAN_DEFAULT_GRANTS)

  // Single-tenant-shape paths. Multi-mode tenancy layer's `pages:extend` hook
  // adds `/@:orgSlug/kanban/...` aliases automatically.
  registerApp({
    id: 'kanban',
    title: 'Kanban',
    path: '/kanban',
    icon: 'i-lucide-columns-3',
    requiredPermission: 'kanban.access',
    order: 30
  })

  registerNavItem({
    appId: 'kanban',
    title: 'Board',
    path: '/kanban',
    icon: 'i-lucide-layout-dashboard',
    requiredPermission: 'kanban.read',
    order: 10
  })
})
