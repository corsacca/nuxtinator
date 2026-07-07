import { registerPermissions } from '#core/server/utils/permissions-registry'
import { registerDefaultGrants } from '#core/server/utils/default-grants-registry'
import { registerApp } from '#core/server/utils/app-registry'
import { registerNavItem } from '#core/server/utils/nav-registry'
import { registerSetting } from '#core/server/utils/settings-registry'
import { INBOX_PERMISSIONS, INBOX_PERMISSION_META, INBOX_DEFAULT_GRANTS } from '../../app/utils/permissions'
import {
  INBOX_SETTINGS_NAMESPACE,
  INBOX_SETTING_INBOUND_DOMAIN,
  INBOX_SETTING_CONTACT_ADDRESS,
  INBOX_SETTING_AUTO_ACK
} from '../utils/inbox-settings'

// Single owner of all inbox boot registrations. Deliberately reads nothing
// from the CRM registries at boot (Nitro plugin order is alphabetical, not
// layer order) — every CRM lookup (channel types, record definitions) happens
// request-time through the merged-definition readers.
export default defineNitroPlugin(() => {
  registerPermissions(INBOX_PERMISSIONS, INBOX_PERMISSION_META)
  registerDefaultGrants('inbox', INBOX_DEFAULT_GRANTS)

  // Per-org settings (core_settings overrides; these are the code defaults).
  const config = useRuntimeConfig()
  registerSetting<string>({
    namespace: INBOX_SETTINGS_NAMESPACE,
    key: INBOX_SETTING_INBOUND_DOMAIN,
    default: String(config.inboxDomain || '').toLowerCase(),
    parse: v => String(v ?? '').trim().toLowerCase(),
    label: 'Inbound mail domain'
  })
  registerSetting<string>({
    namespace: INBOX_SETTINGS_NAMESPACE,
    key: INBOX_SETTING_CONTACT_ADDRESS,
    default: String(config.inboxContactAddress || '').toLowerCase(),
    parse: v => String(v ?? '').trim().toLowerCase(),
    label: 'Shared contact address'
  })
  registerSetting<boolean>({
    namespace: INBOX_SETTINGS_NAMESPACE,
    key: INBOX_SETTING_AUTO_ACK,
    default: true,
    parse: v => v !== false && v !== 'false',
    label: 'Auto-acknowledge new conversations'
  })
  registerApp({
    id: 'inbox',
    title: 'Inbox',
    path: '/inbox',
    icon: 'i-lucide-inbox',
    requiredPermission: 'inbox.access',
    order: 35
  })
  registerNavItem({
    appId: 'inbox',
    title: 'Conversations',
    path: '/inbox',
    icon: 'i-lucide-mails',
    requiredPermission: 'inbox.access',
    order: 10
  })
})
