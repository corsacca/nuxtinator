// Permission slug resolution for record routes. The code-declared contacts
// type carries its own granular slugs (crm.contacts.*); every other record
// type — admin-created customs included — shares the generic crm.records.*
// set, because the permission registry is code-owned and runtime-created
// types cannot mint slugs of their own.

import type { CrmPermission } from '../../app/utils/permissions'

export const CRM_RECORD_ACTIONS = ['read', 'create', 'update', 'delete', 'share', 'view_all'] as const

export type CrmRecordAction = typeof CRM_RECORD_ACTIONS[number]

// Per-type role grants, stored on the type's crm_record_types row under
// config.roleGrants. Semantics are override-with-fallback: a present entry
// (role × action → boolean) IS that role's answer in either direction; an
// absent entry falls back to whether the role's own slug set carries
// permFor(typeKey, action). Only explicit true/false entries are ever
// persisted — see updateTypeRoleGrants (schema-admin.ts) and the evaluator
// (type-permissions.ts).
export type CrmTypeRoleGrants = Record<string, Partial<Record<CrmRecordAction, boolean>>>

export function permFor(typeKey: string, action: CrmRecordAction): CrmPermission {
  return typeKey === 'contacts' ? `crm.contacts.${action}` : `crm.records.${action}`
}
