// Adds the List of 100 contacts table to the host schema by merging into
// core's global `NuxtinatorDatabaseTables` registry (resolution-independent —
// see core's server/database/schema.ts).
import type { ColumnType, Generated } from 'kysely'

export type FaithStatus = 'believer' | 'non_believer' | 'unknown'
export type Relationship = 'family' | 'friend' | 'coworker' | 'neighbor' | 'classmate' | 'other'

export interface ListOf100ContactsTable {
  id: Generated<string>
  user_id: string
  name: string
  relationship: Relationship
  faith_status: FaithStatus
  notes: string | null
  last_contacted_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  last_prayed_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  sort_order: Generated<number>
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

declare global {
  interface NuxtinatorDatabaseTables {
    list_of_100_contacts: ListOf100ContactsTable
  }
}
