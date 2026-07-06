// Client bridge to the record channel + consent endpoints. Thin, stateless
// wrappers — the channel widget and consent panel own their state and refetch
// (or emit refresh) after each mutation.

import type { MaybeRefOrGetter } from 'vue'
import type { CrmChannelEntry } from '#crm'

/** Current consent state for one (channel, purpose), as served by the consent endpoints. */
export interface CrmConsentStateEntry {
  purpose: string
  status: 'opt_in' | 'opt_out'
  grantedAt: string | null
  revokedAt: string | null
  source: string | null
}

/** One compliance-log row (newest first in responses). */
export interface CrmConsentEventEntry {
  id: string
  purpose: string
  event: 'grant' | 'revoke'
  source: string | null
  actorUserId: string | null
  occurredAt: string
}

/** Consent overview for one channel linked to the record. */
export interface CrmChannelConsentInfo {
  channelId: string
  channelType: string
  value: string
  consents: CrmConsentStateEntry[]
  suppressed: boolean
  events: CrmConsentEventEntry[]
}

export interface CrmConsentPurposeInfo {
  key: string
  title: string
  description?: string
}

/** Response of GET /api/crm/records/:type/:id/consent. */
export interface CrmRecordConsentOverview {
  purposes: CrmConsentPurposeInfo[]
  channels: CrmChannelConsentInfo[]
}

export type CrmConsentStatus = 'opt_in' | 'opt_out'
export type CrmConsentSource = 'verbal' | 'form' | 'other'

/** Response of the channel add/update routes — the field's entries after the change. */
export interface CrmChannelEntriesResponse {
  fieldKey: string
  entries: CrmChannelEntry[]
}

/** Response of POST /api/crm/records/:type/:id/consent. */
export interface CrmConsentChangeResponse {
  channelId: string
  consents: CrmConsentStateEntry[]
  suppressed: boolean
  /** False when the channel was already in the requested state. */
  changed: boolean
}

// Code-owned capture-source options for consent UIs — mirrors the route's
// vocabulary; labels live here, never in the DB.
export const CRM_CONSENT_SOURCES: Array<{ value: CrmConsentSource, label: string }> = [
  { value: 'verbal', label: 'Verbal' },
  { value: 'form', label: 'Form' },
  { value: 'other', label: 'Other' }
]

export function useCrmChannels(typeKey: MaybeRefOrGetter<string>, recordId: MaybeRefOrGetter<string>) {
  const base = () => `/api/crm/records/${toValue(typeKey)}/${toValue(recordId)}`

  function addChannel(body: {
    channelTypeKey: string
    fieldKey: string
    value: string
    label?: string | null
    primary?: boolean
  }): Promise<CrmChannelEntriesResponse> {
    return $fetch<CrmChannelEntriesResponse>(`${base()}/channels`, { method: 'POST', body })
  }

  function updateChannel(linkId: string, body: {
    value?: string
    label?: string | null
    primary?: boolean
  }): Promise<CrmChannelEntriesResponse> {
    return $fetch<CrmChannelEntriesResponse>(`${base()}/channels/${linkId}`, { method: 'PATCH', body })
  }

  function removeChannel(linkId: string): Promise<{ ok: boolean }> {
    return $fetch<{ ok: boolean }>(`${base()}/channels/${linkId}`, { method: 'DELETE' })
  }

  function fetchConsent(): Promise<CrmRecordConsentOverview> {
    return $fetch<CrmRecordConsentOverview>(`${base()}/consent`)
  }

  function setConsent(body: {
    channelId: string
    purpose: string
    status: CrmConsentStatus
    source: CrmConsentSource
    note?: string
  }): Promise<CrmConsentChangeResponse> {
    return $fetch<CrmConsentChangeResponse>(`${base()}/consent`, { method: 'POST', body })
  }

  return { addChannel, updateChannel, removeChannel, fetchConsent, setConsent }
}
