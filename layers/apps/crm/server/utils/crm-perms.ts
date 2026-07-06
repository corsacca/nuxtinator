// Permission slug resolution for record routes. The code-declared contacts
// type carries its own granular slugs (crm.contacts.*); every other record
// type — admin-created customs included — shares the generic crm.records.*
// set, because the permission registry is code-owned and runtime-created
// types cannot mint slugs of their own.

import type { CrmPermission } from '../../app/utils/permissions'

export type CrmRecordAction = 'read' | 'create' | 'update' | 'delete' | 'share' | 'view_all'

export function permFor(typeKey: string, action: CrmRecordAction): CrmPermission {
  return typeKey === 'contacts' ? `crm.contacts.${action}` : `crm.records.${action}`
}
