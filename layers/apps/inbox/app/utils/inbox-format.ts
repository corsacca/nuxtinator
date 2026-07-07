// Client-side display helpers shared by the inbox components.
import DOMPurify from 'dompurify'

// Sanitize inbound HTML before v-html. The server sanitizes email SINKS
// (outbound mail); the browser view is its own sink and sanitizes here.
export function inboxSanitizeDisplayHtml(html: string | null | undefined): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'button'],
    FORBID_ATTR: ['srcset']
  })
}

export function inboxRelativeTime(value: string | Date | null | undefined): string {
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

export const INBOX_STATUS_META: Record<string, { label: string, color: 'primary' | 'warning' | 'neutral' | 'error' | 'success' }> = {
  open: { label: 'Open', color: 'primary' },
  pending: { label: 'Pending', color: 'warning' },
  closed: { label: 'Closed', color: 'neutral' },
  spam: { label: 'Spam', color: 'error' }
}
