// Email rendering for global notifications. Both senders build entirely from
// the notification snapshot (title / body / link) — they never re-query the
// producing app, which is what lets one mailer serve every app.
//
// Links are stored naive (`/messages/<id>`); for email we only prepend the
// site origin. In multi-tenant mode the in-browser route guard adds the
// `/@<slug>` org prefix once the recipient lands on the SPA (matching how the
// rest of the app emails in-app links).
//
// All senders are best-effort: failures are logged and swallowed so a mailer
// outage never blocks the sweep that calls them.

import { db } from '#core/server/utils/database'
import { sendTemplateEmail } from '#email'

export interface NotificationEmailRow {
  id: string
  user_id: string
  title: string
  body: string | null
  link: string
}

interface UserLookup {
  email: string
  display_name: string
}

async function loadUser(userId: string): Promise<UserLookup | null> {
  const row = await db
    .selectFrom('users')
    .select(['email', 'display_name'])
    .where('id', '=', userId)
    .executeTakeFirst()
  if (!row?.email) return null
  return { email: row.email, display_name: row.display_name || 'there' }
}

function getSiteUrl(): string {
  try {
    const cfg = useRuntimeConfig()
    const pub = (cfg.public ?? {}) as { siteUrl?: string }
    return (pub.siteUrl || '').replace(/\/$/, '')
  } catch {
    return ''
  }
}

function absoluteLink(link: string): string {
  return `${getSiteUrl()}${link.startsWith('/') ? link : `/${link}`}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// One email per `immediate` notification.
export async function sendImmediateNotificationEmail(row: NotificationEmailRow): Promise<void> {
  try {
    const recipient = await loadUser(row.user_id)
    if (!recipient) return

    const bodyHtml = row.body
      ? `<strong>${escapeHtml(row.title)}</strong><br><br>${escapeHtml(row.body)}`
      : `<strong>${escapeHtml(row.title)}</strong>`

    await sendTemplateEmail({
      to: recipient.email,
      template: 'notification',
      subject: row.title,
      data: {
        userName: recipient.display_name,
        userEmail: recipient.email,
        message: bodyHtml,
        actionUrl: absoluteLink(row.link),
        actionText: 'Open'
      }
    })
  } catch (err) {
    console.error('[notifications] immediate email failed:', err)
  }
}

// One digest email summarizing a user's pending `digest` notifications.
export async function sendNotificationDigestEmail(
  userId: string,
  rows: NotificationEmailRow[]
): Promise<void> {
  try {
    if (rows.length === 0) return
    const recipient = await loadUser(userId)
    if (!recipient) return

    const items = rows
      .map((r) => {
        const text = r.body ? `${r.title} — ${r.body}` : r.title
        return `<li><a href="${absoluteLink(r.link)}" style="color:#000000">${escapeHtml(text)}</a></li>`
      })
      .join('')

    await sendTemplateEmail({
      to: recipient.email,
      template: 'notification',
      subject: `You have ${rows.length} new notification${rows.length === 1 ? '' : 's'}`,
      data: {
        userName: recipient.display_name,
        userEmail: recipient.email,
        message: `Here's what you missed:<ul style="color:#666;line-height:1.6;margin:12px 0;padding-left:20px">${items}</ul>`,
        actionUrl: getSiteUrl() || undefined,
        actionText: getSiteUrl() ? 'Open app' : undefined
      }
    })
  } catch (err) {
    console.error('[notifications] digest email failed:', err)
  }
}
