// Client-side field-kind dispatcher — the single registry mapping each
// CrmFieldKind to how it renders: an optional inline editor component and a
// plain-text formatter used by table cells and read-only detail rows.
// Kinds without an editor component render read-only (communication_channel
// renders through the channel widget in a later milestone).

import type { CrmChannelEntry, CrmFieldKind, CrmFieldOption, CrmLinkValue } from '#crm'

/** A merged field definition as served by GET /api/crm/schema/types/:type/fields. */
export interface CrmFieldSetting {
  key: string
  kind: CrmFieldKind
  label: string
  section: string | null
  required: boolean
  hidden: boolean
  order: number
  options: Record<string, CrmFieldOption> | null
  custom: boolean
  orphan: boolean
  channelType: string | null
  target: string | null
  multiple: boolean
  /** Promoted-column flag — 'name'/'status' fields live on the record row. */
  column: 'name' | 'status' | null
}

/** Section map as served alongside the fields (`sections` in the response). */
export type CrmTypeSections = Record<string, { label: string, order?: number }>

/** Extra lookups a formatter may use; every entry is optional. */
export interface CrmFormatContext {
  /** Resolves a user id to a display name (see useCrmUsers().userName). */
  userName?: (id: string) => string | null
}

export interface CrmKindRenderer {
  /** Inline editor component (auto-named Crm*); absent = read-only display. */
  component?: string
  /** Plain-text rendering for table cells and read-only rows. */
  format: (value: unknown, field: CrmFieldSetting, ctx?: CrmFormatContext) => string
}

const EMPTY = '—'

/** Badge palette — option colors outside this set fall back to neutral. */
const BADGE_COLORS = new Set(['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'])
export type CrmBadgeColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

export function crmOptionLabel(field: CrmFieldSetting, key: string): string {
  return field.options?.[key]?.label ?? key
}

export function crmOptionColor(field: CrmFieldSetting, key: string | null | undefined): CrmBadgeColor {
  const color = key ? field.options?.[key]?.color : undefined
  return color && BADGE_COLORS.has(color) ? color as CrmBadgeColor : 'neutral'
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function formatText(value: unknown): string {
  if (value === null || value === undefined || value === '') return EMPTY
  return String(value)
}

function formatDateValue(value: unknown, withTime: boolean): string {
  if (typeof value !== 'string' || value === '') return EMPTY
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return EMPTY
  return withTime ? d.toLocaleString() : d.toLocaleDateString()
}

export const CRM_FIELD_KINDS: Record<CrmFieldKind, CrmKindRenderer> = {
  text: {
    component: 'CrmFieldsTextField',
    format: formatText
  },
  textarea: {
    component: 'CrmFieldsTextareaField',
    format: formatText
  },
  number: {
    component: 'CrmFieldsNumberField',
    format: value => typeof value === 'number' ? value.toLocaleString() : formatText(value)
  },
  boolean: {
    component: 'CrmFieldsBooleanField',
    format: value => value === null || value === undefined ? EMPTY : (value ? 'Yes' : 'No')
  },
  date: {
    component: 'CrmFieldsDateField',
    format: value => formatDateValue(value, false)
  },
  datetime: {
    component: 'CrmFieldsDatetimeField',
    format: value => formatDateValue(value, true)
  },
  key_select: {
    component: 'CrmFieldsKeySelectField',
    format: (value, field) =>
      typeof value === 'string' && value !== '' ? crmOptionLabel(field, value) : EMPTY
  },
  multi_select: {
    component: 'CrmFieldsMultiSelectField',
    format: (value, field) => {
      const keys = asArray(value)
      if (keys.length === 0) return EMPTY
      return keys.map(k => crmOptionLabel(field, String(k))).join(', ')
    }
  },
  tags: {
    component: 'CrmFieldsTagsField',
    format: (value) => {
      const tags = asArray(value)
      return tags.length > 0 ? tags.map(String).join(', ') : EMPTY
    }
  },
  user_select: {
    component: 'CrmFieldsUserSelectField',
    format: (value, _field, ctx) => {
      const ids = Array.isArray(value)
        ? value.map(String)
        : (typeof value === 'string' && value !== '' ? [value] : [])
      if (ids.length === 0) return EMPTY
      if (ctx?.userName) return ids.map(id => ctx.userName!(id) ?? id).join(', ')
      return ids.length === 1 ? '1 user' : `${ids.length} users`
    }
  },
  communication_channel: {
    format: (value) => {
      const entries = asArray(value) as CrmChannelEntry[]
      return entries.length > 0 ? entries.map(e => e.value).join(', ') : EMPTY
    }
  },
  connection: {
    component: 'CrmFieldsConnectionField',
    // Count only — list rows never carry connection values, and the detail
    // page renders names through the editor and the connections panel.
    format: (value) => {
      const ids = asArray(value)
      if (ids.length === 0) return EMPTY
      return ids.length === 1 ? '1 linked' : `${ids.length} linked`
    }
  },
  link: {
    component: 'CrmFieldsLinkField',
    format: (value) => {
      const links = asArray(value) as CrmLinkValue[]
      return links.length > 0 ? links.map(l => l.label || l.url).join(', ') : EMPTY
    }
  }
}

/** Unknown kinds (stale orphan fields) fall back to plain-text display. */
export function crmRendererFor(kind: string): CrmKindRenderer {
  return CRM_FIELD_KINDS[kind as CrmFieldKind] ?? { format: formatText }
}

export function formatCrmValue(value: unknown, field: CrmFieldSetting, ctx?: CrmFormatContext): string {
  return crmRendererFor(field.kind).format(value, field, ctx)
}

/** Human-readable message from a $fetch error (statusMessage detail first). */
export function crmErrorMessage(err: unknown, fallback: string): string {
  return (err as { data?: { statusMessage?: string } } | null)?.data?.statusMessage
    || (err as { message?: string } | null)?.message
    || fallback
}
