import { registerPermissions } from '#core/server/utils/permissions-registry'
import { registerDefaultGrants } from '#core/server/utils/default-grants-registry'
import { registerApp } from '#core/server/utils/app-registry'
import { registerNavItem } from '#core/server/utils/nav-registry'
import {
  EXAMPLE_PERMISSIONS,
  EXAMPLE_PERMISSION_META,
  EXAMPLE_DEFAULT_GRANTS
} from '../../app/utils/permissions'

export default defineNitroPlugin(() => {
  registerPermissions(EXAMPLE_PERMISSIONS, EXAMPLE_PERMISSION_META)
  registerDefaultGrants('example', EXAMPLE_DEFAULT_GRANTS)

  // Paths are written single-tenant-shape. In multi-tenant mode the tenancy
  // layer's `pages:extend` hook adds `/@:orgSlug/example/...` aliases pointing
  // at the same pages, and the router guard preserves the active-org prefix on
  // internal navigation. Don't hand-write the `/@:slug` prefix here.
  registerApp({
    id: 'example',
    title: 'Example',
    path: '/example',
    icon: 'i-lucide-box',
    requiredPermission: 'example.access',
    order: 90
  })

  registerNavItem({
    appId: 'example',
    title: 'Overview',
    path: '/example',
    icon: 'i-lucide-box',
    requiredPermission: 'example.read',
    order: 10
  })
})
