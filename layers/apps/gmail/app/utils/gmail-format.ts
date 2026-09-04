// Client-side display helpers shared by the gmail components.

export interface GmailAddressView {
  name: string | null
  address: string
}

export function gmailErrorMessage(err: unknown): string | undefined {
  const e = err as { data?: { statusMessage?: string }, statusMessage?: string } | null
  return e?.data?.statusMessage
    || e?.statusMessage
    || (err instanceof Error ? err.message : undefined)
}

// Gmail-style list dates: time today, "Mon 3" style within the year,
// otherwise a short date.
export function gmailListDate(value: string | Date | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return d.toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' })
}

export function gmailFullDate(value: string | Date | null | undefined): string {
  if (!value) return ''
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function gmailRelativeTime(value: string | Date | null | undefined): string {
  if (!value) return ''
  const then = new Date(value).getTime()
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(value).toLocaleDateString()
}

export function gmailDisplayName(a: GmailAddressView | null | undefined, selfAddresses: Set<string> = new Set()): string {
  if (!a) return ''
  if (selfAddresses.has(a.address.toLowerCase())) return 'me'
  return a.name?.trim() || a.address
}

export function gmailFormatAddressLine(list: GmailAddressView[]): string {
  return list.map(a => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', ')
}

export function gmailFileSize(bytes: number | null | undefined): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// A stable accent per account so rows in the unified list can be told apart.
const ACCOUNT_COLORS = ['primary', 'secondary', 'info', 'success', 'warning', 'error'] as const
export type GmailAccountColor = typeof ACCOUNT_COLORS[number]

export function gmailAccountColor(accountId: string, order: string[]): GmailAccountColor {
  const idx = order.indexOf(accountId)
  return ACCOUNT_COLORS[(idx >= 0 ? idx : 0) % ACCOUNT_COLORS.length]!
}

export interface GmailSnoozePreset {
  key: string
  label: string
  at: () => Date
}

function at(base: Date, hour: number): Date {
  const d = new Date(base)
  d.setHours(hour, 0, 0, 0)
  return d
}

// Gmail's preset shapes, computed in the browser's timezone at click time.
export function gmailSnoozePresets(now = new Date()): GmailSnoozePreset[] {
  const presets: GmailSnoozePreset[] = []
  if (now.getHours() < 17) presets.push({ key: 'later_today', label: 'Later today (6 PM)', at: () => at(now, 18) })
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  presets.push({ key: 'tomorrow', label: 'Tomorrow (8 AM)', at: () => at(tomorrow, 8) })
  const weekend = new Date(now)
  const daysToSat = (6 - now.getDay() + 7) % 7 || 7
  weekend.setDate(now.getDate() + daysToSat)
  presets.push({ key: 'weekend', label: 'This weekend (Sat 8 AM)', at: () => at(weekend, 8) })
  const nextWeek = new Date(now)
  const daysToMon = (1 - now.getDay() + 7) % 7 || 7
  nextWeek.setDate(now.getDate() + daysToMon)
  presets.push({ key: 'next_week', label: 'Next week (Mon 8 AM)', at: () => at(nextWeek, 8) })
  return presets
}

export function gmailSnoozeLabel(until: string | Date | null | undefined): string {
  if (!until) return ''
  const d = new Date(until)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return `Today, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
