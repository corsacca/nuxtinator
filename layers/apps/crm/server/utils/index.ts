// Server entry for the `#crm/server` alias — the surface consumer layers
// (email inbox, marketing, forms) import kernel services from.

export {
  registerCrmRecordType,
  getRegisteredRecordTypes,
  getRegisteredRecordType,
  registerCrmChannelType,
  getRegisteredChannelTypes,
  registerCrmConsentPurpose,
  getRegisteredConsentPurposes,
  registerCrmFieldFilter,
  runCrmFieldFilters
} from './crm-registry'
export type {
  CrmChannelTypeEntry,
  CrmConsentPurposeMeta,
  CrmFieldPatch,
  CrmFieldFilterPhase,
  CrmFieldFilter
} from './crm-registry'

export {
  getRecordTypes,
  getRecordType,
  getRecordTypeFields,
  getChannelTypes,
  getChannelType
} from './definition-settings'
export type {
  CrmRecordTypeSetting,
  CrmFieldSetting,
  CrmChannelTypeSetting
} from './definition-settings'

export { normalizeChannelValue, channelFingerprint } from './normalize'
export type { NormalizedChannelValue } from './normalize'

export { claimChannel, findChannel, linkChannel, unlinkChannel, setPrimary } from './channels'
export type { CrmChannelRow, CrmChannelLinkRow, LinkChannelOpts } from './channels'

export { hydrateRecords, getRecord, applyFieldPatch, deleteRecord } from './record-storage'
export type { CrmRecordRow, CrmHydratedRecord } from './record-storage'

export { permFor } from './crm-perms'
export type { CrmRecordAction } from './crm-perms'

export { listRecords, requireRecordType, assertRecordVisible } from './list-records'
export type { CrmListOpts, CrmRecordListItem, CrmListResult } from './list-records'

export { recordCrmActivity } from './crm-activity'
export type { CrmActivityAction, CrmActivityOpts } from './crm-activity'
