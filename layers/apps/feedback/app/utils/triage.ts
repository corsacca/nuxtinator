/**
 * Triage vocabulary for the feedback inbox. Per the persisted-state convention,
 * the database stores only the chosen reason KEY in a card's post_meta; the
 * human-facing LABELS live here in code. Adding a reason or changing a label is
 * a code edit — never a migration or data backfill.
 *
 * A triaged card carries up to three keys in post_meta:
 *   - triage_outcome: 'accepted' | 'rejected' | 'spam' (the disposition)
 *   - triage_reason:  one of the keys below (why it was rejected / marked spam)
 *   - snoozed_until:  ISO string; while in the future the card drops out of the
 *                     inbox list. Set explicitly via the Snooze action only.
 */

export const REJECT_REASONS = [
  { key: 'duplicate', label: 'Duplicate' },
  { key: 'not_actionable', label: 'Not actionable' },
  { key: 'out_of_scope', label: 'Out of scope' },
  { key: 'cannot_reproduce', label: 'Cannot reproduce' },
  { key: 'wont_fix', label: "Won't fix" },
  { key: 'other', label: 'Other' }
] as const

export const SPAM_REASONS = [
  { key: 'spam', label: 'Spam / junk' },
  { key: 'abuse', label: 'Abusive content' },
  { key: 'test_submission', label: 'Test submission' },
  { key: 'bot', label: 'Automated / bot' }
] as const

export type RejectReasonKey = typeof REJECT_REASONS[number]['key']
export type SpamReasonKey = typeof SPAM_REASONS[number]['key']

/** Resolve a stored reason key back to its display label (code-owned). */
export function reasonLabel(
  kind: 'rejected' | 'spam',
  key: string | null | undefined
): string {
  if (!key) return ''
  const table = kind === 'spam' ? SPAM_REASONS : REJECT_REASONS
  return table.find(r => r.key === key)?.label ?? key
}

/**
 * Snooze presets. The action bar offers these durations; the stored value is
 * always an absolute ISO timestamp (snoozed_until), computed from the chosen
 * offset, so the inbox filter never has to reinterpret a relative key.
 */
export const SNOOZE_PRESETS = [
  { key: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
  { key: '1d', label: 'Tomorrow', ms: 24 * 60 * 60 * 1000 },
  { key: '3d', label: '3 days', ms: 3 * 24 * 60 * 60 * 1000 },
  { key: '1w', label: '1 week', ms: 7 * 24 * 60 * 60 * 1000 }
] as const

/** Compact relative age from an ISO/parsable timestamp, e.g. "3h", "2d". */
export function relativeAge(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const sec = Math.max(0, Math.floor(diff / 1000))
  if (sec < 60) return 'now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}w`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo`
  return `${Math.floor(day / 365)}y`
}
