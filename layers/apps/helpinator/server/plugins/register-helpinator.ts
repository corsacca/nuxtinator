import { registerPermissions } from '#core/server/utils/permissions-registry'
import { registerDefaultGrants } from '#core/server/utils/default-grants-registry'
import { registerApp } from '#core/server/utils/app-registry'
import { registerNavItem } from '#core/server/utils/nav-registry'
import { registerAiFeature } from '#ai/server'
import { HELPINATOR_CHAT_FEATURE } from '../utils/helpinator-bot'
import {
  HELPINATOR_PERMISSIONS,
  HELPINATOR_PERMISSION_META,
  HELPINATOR_DEFAULT_GRANTS
} from '../../app/utils/permissions'

export default defineNitroPlugin(() => {
  registerPermissions(HELPINATOR_PERMISSIONS, HELPINATOR_PERMISSION_META)
  registerDefaultGrants('helpinator', HELPINATOR_DEFAULT_GRANTS)

  // One model for every widget in an org, picked on the AI settings pages.
  registerAiFeature({
    key: HELPINATOR_CHAT_FEATURE,
    label: 'Helpinator — help chat',
    description: 'Answers website visitors from a context portfolio.'
  })

  registerApp({
    id: 'helpinator',
    title: 'Helpinator',
    path: '/helpinator',
    icon: 'i-lucide-message-circle-question',
    requiredPermission: 'helpinator.access',
    order: 45
  })

  registerNavItem({
    appId: 'helpinator',
    title: 'Conversations',
    path: '/helpinator',
    icon: 'i-lucide-messages-square',
    requiredPermission: 'helpinator.access',
    order: 10
  })
  registerNavItem({
    appId: 'helpinator',
    title: 'Widgets',
    path: '/helpinator/widgets',
    icon: 'i-lucide-app-window',
    requiredPermission: 'helpinator.manage',
    order: 20
  })
})
