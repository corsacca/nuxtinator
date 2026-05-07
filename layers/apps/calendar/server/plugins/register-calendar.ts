import { registerPermissions } from '#core/server/utils/permissions-registry'
import { registerDefaultGrants } from '#core/server/utils/default-grants-registry'
import { registerApp } from '#core/server/utils/app-registry'
import { registerNavItem } from '#core/server/utils/nav-registry'
import {
  CALENDAR_PERMISSIONS,
  CALENDAR_PERMISSION_META,
  CALENDAR_DEFAULT_GRANTS
} from '../../app/utils/permissions'

export default defineNitroPlugin(() => {
  registerPermissions(CALENDAR_PERMISSIONS, CALENDAR_PERMISSION_META)
  registerDefaultGrants('calendar', CALENDAR_DEFAULT_GRANTS)

  // App layer paths are written single-tenant-shape. In multi-tenant mode the
  // tenancy layer's `pages:extend` hook adds `/@:orgSlug/calendar/...`
  // aliases pointing at the same pages, and the router guard preserves the
  // active-org prefix on internal navigation.
  registerApp({
    id: 'calendar',
    title: 'Calendar',
    path: '/calendar',
    icon: 'i-lucide-calendar',
    requiredPermission: 'calendar.access',
    order: 20
  })

  registerNavItem({
    appId: 'calendar',
    title: 'Schedule',
    path: '/calendar',
    icon: 'i-lucide-calendar-days',
    requiredPermission: 'calendar.read',
    order: 10
  })

  registerNavItem({
    appId: 'calendar',
    title: 'Events',
    path: '/calendar/events',
    icon: 'i-lucide-list',
    requiredPermission: 'calendar.read',
    order: 20
  })
})
