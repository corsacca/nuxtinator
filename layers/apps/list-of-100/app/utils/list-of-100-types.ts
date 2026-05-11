// Shared client-side types for the List of 100 app. Mirrors the server's
// schema.d.ts shape but uses string timestamps (post-JSON serialization).

export type FaithStatus = 'believer' | 'non_believer' | 'unknown'
export type Relationship = 'family' | 'friend' | 'coworker' | 'neighbor' | 'classmate' | 'other'

export interface ListContact {
  id: string
  user_id: string
  name: string
  relationship: Relationship
  faith_status: FaithStatus
  notes: string | null
  last_contacted_at: string | null
  last_prayed_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ListProgress {
  total: number
  contactedLast30d: number
  prayedLast30d: number
}

export type RhythmEventType = 'MARK_CONTACTED' | 'MARK_PRAYED'

export interface RhythmEvent {
  id: string
  timestamp: string
  event_type: RhythmEventType
  metadata: Record<string, unknown> | null
}

export interface InsightsPoint {
  day: string
  contacted: number
  prayed: number
}

export interface InsightsResponse {
  window: '30d' | 'all'
  series: InsightsPoint[]
}

export interface ContactFormState {
  name: string
  relationship: Relationship
  faith_status: FaithStatus
  notes: string
}

export const FAITH_STATUSES: { value: FaithStatus, label: string, color: 'success' | 'warning' | 'neutral' }[] = [
  { value: 'believer', label: 'Believer', color: 'success' },
  { value: 'unknown', label: 'Unknown', color: 'warning' },
  { value: 'non_believer', label: 'Non-believer', color: 'neutral' }
]

export const RELATIONSHIPS: { value: Relationship, label: string }[] = [
  { value: 'family', label: 'Family' },
  { value: 'friend', label: 'Friend' },
  { value: 'coworker', label: 'Coworker' },
  { value: 'neighbor', label: 'Neighbor' },
  { value: 'classmate', label: 'Classmate' },
  { value: 'other', label: 'Other' }
]

export function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'in the future'
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(days / 365)
  return `${years}y ago`
}

export function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 0
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}
