// The `#ai` client alias — types safe to import in Vue components / composables
// (the admin AI model page). Server-only helpers live behind `#ai/server`.

// One model as the admin page renders it: catalog/custom metadata plus its
// current enabled state and which features have selected it.
export interface AiAdminModel {
  id: string
  label: string
  supportsTemperature: boolean
  supportsCaching: boolean
  custom: boolean
  enabled: boolean
}

export interface AiAdminFeature {
  key: string
  label: string
  description?: string
  // The model id currently selected for this feature (resolved effective value).
  model: string
}

// Full payload of GET /api/ai/admin/config.
export interface AiAdminConfig {
  configured: boolean
  models: AiAdminModel[]
  features: AiAdminFeature[]
}
