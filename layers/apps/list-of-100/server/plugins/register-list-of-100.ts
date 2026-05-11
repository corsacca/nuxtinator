import { registerPermissions } from '#core/server/utils/permissions-registry'
import { registerDefaultGrants } from '#core/server/utils/default-grants-registry'
import { registerApp } from '#core/server/utils/app-registry'
import { registerNavItem } from '#core/server/utils/nav-registry'
import {
  LIST_OF_100_PERMISSIONS,
  LIST_OF_100_PERMISSION_META,
  LIST_OF_100_DEFAULT_GRANTS
} from '../../app/utils/permissions'

export default defineNitroPlugin(() => {
  registerPermissions(LIST_OF_100_PERMISSIONS, LIST_OF_100_PERMISSION_META)
  registerDefaultGrants('list-of-100', LIST_OF_100_DEFAULT_GRANTS)

  registerApp({
    id: 'list-of-100',
    title: 'List of 100',
    path: '/list-of-100',
    icon: '100',
    description: 'Steward the 100 relationships God has put in your life.',
    requiredPermission: 'list-of-100.access',
    order: 30
  })

  registerNavItem({
    appId: 'list-of-100',
    title: 'My List',
    path: '/list-of-100',
    icon: 'i-lucide-list',
    requiredPermission: 'list-of-100.read',
    order: 10
  })
})
