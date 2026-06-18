import { registerPermissions } from '#core/server/utils/permissions-registry'
import { registerDefaultGrants } from '#core/server/utils/default-grants-registry'
import { registerApp } from '#core/server/utils/app-registry'
import { registerNavItem } from '#core/server/utils/nav-registry'
import {
  FEEDBACK_PERMISSIONS,
  FEEDBACK_PERMISSION_META,
  FEEDBACK_DEFAULT_GRANTS
} from '../../app/utils/permissions'

export default defineNitroPlugin(() => {
  registerPermissions(FEEDBACK_PERMISSIONS, FEEDBACK_PERMISSION_META)
  registerDefaultGrants('feedback', FEEDBACK_DEFAULT_GRANTS)

  registerApp({
    id: 'feedback',
    title: 'Feedback',
    path: '/feedback',
    icon: 'i-lucide-bug',
    requiredPermission: 'feedback.access',
    order: 30
  })

  registerNavItem({
    appId: 'feedback',
    title: 'Board',
    path: '/feedback',
    icon: 'i-lucide-layout-dashboard',
    requiredPermission: 'feedback.read',
    order: 10
  })
})
