import { registerSetting } from '#core/server/utils/settings-registry'
import { registerAdminSection } from '#core/server/utils/admin-section-registry'
import { AI_MODEL_CATALOG } from '../utils/ai-models'
import {
  AI_SETTINGS_NAMESPACE,
  AI_SETTING_ENABLED_MODELS,
  AI_SETTING_CUSTOM_MODELS,
  AI_SETTING_FEATURE_MODELS,
  sanitizeModelIdList,
  sanitizeFeatureModels
} from '../utils/ai-settings'

// Single owner of the AI layer's boot registrations: the three `core_settings`
// overrides (enabled models / custom ids / per-feature model choices) with their
// code-owned defaults, plus the admin AI section. No permission slug — model
// enablement is operator-admin (the shared API key spends the host's budget), so
// the endpoints gate on requireOperatorAdmin and the section rides the
// operator-gated /admin area with no requiredPermission.
export default defineNitroPlugin(() => {
  registerSetting<string[]>({
    namespace: AI_SETTINGS_NAMESPACE,
    key: AI_SETTING_ENABLED_MODELS,
    // Default: the catalog's default-enabled ids. The DB stores an override only
    // once an admin changes the set.
    default: AI_MODEL_CATALOG.filter(m => m.defaultEnabled).map(m => m.id),
    parse: sanitizeModelIdList,
    label: 'Enabled models'
  })

  registerSetting<string[]>({
    namespace: AI_SETTINGS_NAMESPACE,
    key: AI_SETTING_CUSTOM_MODELS,
    default: [],
    parse: sanitizeModelIdList,
    label: 'Custom model ids'
  })

  registerSetting<Record<string, string>>({
    namespace: AI_SETTINGS_NAMESPACE,
    key: AI_SETTING_FEATURE_MODELS,
    default: {},
    parse: sanitizeFeatureModels,
    label: 'Per-feature model choices'
  })

  registerAdminSection({
    appId: 'ai',
    title: 'AI',
    path: '/admin/ai',
    icon: 'i-lucide-sparkles',
    order: 60
  })
})
