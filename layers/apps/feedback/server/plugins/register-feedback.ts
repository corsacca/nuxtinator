import { registerPermissions } from '#core/server/utils/permissions-registry'
import { registerDefaultGrants } from '#core/server/utils/default-grants-registry'
import { registerApp } from '#core/server/utils/app-registry'
import { registerNavItem } from '#core/server/utils/nav-registry'
import { registerSetting } from '#core/server/utils/settings-registry'
import {
  FEEDBACK_PERMISSIONS,
  FEEDBACK_PERMISSION_META,
  FEEDBACK_DEFAULT_GRANTS
} from '../../app/utils/permissions'
import {
  FEEDBACK_SETTINGS_NAMESPACE,
  DEFAULT_NOTIFY_SETTING_KEY,
  sanitizeNotifyUserIds
} from '../utils/notify-recipients'

export default defineNitroPlugin(() => {
  registerPermissions(FEEDBACK_PERMISSIONS, FEEDBACK_PERMISSION_META)
  registerDefaultGrants('feedback', FEEDBACK_DEFAULT_GRANTS)

  // Org-wide default notification recipients. Used when a project hasn't chosen
  // its own list. Default is empty (notify no one); the value is a user-id list
  // editable from the Feedback settings UI.
  registerSetting<string[]>({
    namespace: FEEDBACK_SETTINGS_NAMESPACE,
    key: DEFAULT_NOTIFY_SETTING_KEY,
    default: [],
    parse: sanitizeNotifyUserIds,
    label: 'Default notification recipients'
  })

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

  // Inbox triage — a dense, keyboard-driven reading list that sits in front of
  // the board. Only accepted items become board cards. Writing (accept/reject/
  // snooze) gates on feedback.write.
  registerNavItem({
    appId: 'feedback',
    title: 'Triage',
    path: '/feedback/triage',
    icon: 'i-lucide-inbox',
    requiredPermission: 'feedback.write',
    order: 20
  })
})
