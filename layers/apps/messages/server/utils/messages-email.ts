// Email senders for the messages layer.
//
// Per-event emails (mentions + DMs) are fired from the route handlers AFTER
// the originating transaction commits, so the recipient's email reflects a
// committed item/comment. The daily digest scheduler calls `sendDigestEmail`
// for users with unread digest-eligible signals.
//
// All senders are best-effort: failures are logged and swallowed. The
// notification rows in `messages_notifications` are stamped with
// `emailed_at = now()` regardless, so the digest scan correctly skips them.

import { db } from '#core/server/utils/database'
import { sendTemplateEmail } from '#email'

export interface MentionEmailInput {
  recipientId: string
  actorId: string
  conversationId: string
  itemId?: string | null
  commentId?: string | null
  bodyMd: string
}

export interface DmEmailInput {
  recipientId: string
  actorId: string
  conversationId: string
  itemId: string
  bodyMd: string
}

export interface DigestChannelEntry {
  conversationId: string
  conversationName: string
  unreadCount: number
}

export interface DigestThreadEntry {
  itemId: string
  conversationId: string
  conversationName: string | null
  excerpt: string
  count: number
}

export interface DigestEmailInput {
  recipientId: string
  channels: DigestChannelEntry[]
  threads: DigestThreadEntry[]
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

function buildConversationLink(conversationId: string): string {
  const base = getSiteUrl()
  return `${base}/messages/${conversationId}`
}

function truncate(s: string, max = 280): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

// Strips markdown link syntax for excerpt rendering — keeps `[@Name](uuid)`
// readable as `@Name`, code spans as plain text, etc. Best-effort, not a
// full markdown renderer.
function plainifyExcerpt(md: string): string {
  return md
    .replace(/\[@([^\]\n]+)\]\(([0-9a-f-]{36})\)/g, '@$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .trim()
}

async function loadConversationLabel(conversationId: string): Promise<string> {
  const conv = await db
    .selectFrom('messages_conversations')
    .select(['kind', 'name'])
    .where('id', '=', conversationId)
    .executeTakeFirst()
  if (!conv) return 'a conversation'
  if (conv.kind === 'channel') return conv.name ? `#${conv.name}` : 'a channel'
  // For DMs, label by participants — caller fetches if needed.
  return 'a direct message'
}

export async function sendMentionEmail(input: MentionEmailInput): Promise<void> {
  try {
    const [recipient, actor] = await Promise.all([
      loadUser(input.recipientId),
      loadUser(input.actorId)
    ])
    if (!recipient) return
    const actorName = actor?.display_name ?? 'Someone'
    const label = await loadConversationLabel(input.conversationId)
    const excerpt = truncate(plainifyExcerpt(input.bodyMd))
    const link = buildConversationLink(input.conversationId)

    await sendTemplateEmail({
      to: recipient.email,
      template: 'notification',
      subject: `${actorName} mentioned you in ${label}`,
      data: {
        userName: recipient.display_name,
        userEmail: recipient.email,
        message: `<strong>${escapeHtml(actorName)}</strong> mentioned you in ${escapeHtml(label)}:<br><br>${escapeHtml(excerpt)}`,
        actionUrl: link,
        actionText: 'Open Messages'
      }
    })
  } catch (err) {
    console.error('[messages-email] sendMentionEmail failed:', err)
  }
}

export async function sendDmEmail(input: DmEmailInput): Promise<void> {
  try {
    const [recipient, actor] = await Promise.all([
      loadUser(input.recipientId),
      loadUser(input.actorId)
    ])
    if (!recipient) return
    const actorName = actor?.display_name ?? 'Someone'
    const excerpt = truncate(plainifyExcerpt(input.bodyMd))
    const link = buildConversationLink(input.conversationId)

    await sendTemplateEmail({
      to: recipient.email,
      template: 'notification',
      subject: `New message from ${actorName}`,
      data: {
        userName: recipient.display_name,
        userEmail: recipient.email,
        message: `<strong>${escapeHtml(actorName)}</strong> sent you a direct message:<br><br>${escapeHtml(excerpt)}`,
        actionUrl: link,
        actionText: 'Open conversation'
      }
    })
  } catch (err) {
    console.error('[messages-email] sendDmEmail failed:', err)
  }
}

export async function sendDigestEmail(input: DigestEmailInput): Promise<void> {
  try {
    const recipient = await loadUser(input.recipientId)
    if (!recipient) return
    if (input.channels.length === 0 && input.threads.length === 0) return

    const channelHtml = input.channels.length > 0
      ? `<h3 style="margin:20px 0 8px 0;color:#333">Channels</h3><ul style="color:#666;line-height:1.6;margin:0;padding-left:20px">${
          input.channels
            .map(c => `<li>${c.unreadCount} new in ${escapeHtml(c.conversationName ? `#${c.conversationName}` : 'a channel')}</li>`)
            .join('')
        }</ul>`
      : ''

    const threadHtml = input.threads.length > 0
      ? `<h3 style="margin:20px 0 8px 0;color:#333">Threads</h3><ul style="color:#666;line-height:1.6;margin:0;padding-left:20px">${
          input.threads
            .map(t => {
              const label = t.conversationName ? `#${t.conversationName}` : 'a conversation'
              return `<li>${t.count} new comment${t.count === 1 ? '' : 's'} in ${escapeHtml(label)} on “${escapeHtml(truncate(plainifyExcerpt(t.excerpt), 80))}”</li>`
            })
            .join('')
        }</ul>`
      : ''

    const link = `${getSiteUrl()}/messages`

    await sendTemplateEmail({
      to: recipient.email,
      template: 'notification',
      subject: 'Your daily Messages digest',
      data: {
        userName: recipient.display_name,
        userEmail: recipient.email,
        message: `Here's what you missed since yesterday.${channelHtml}${threadHtml}`,
        actionUrl: link,
        actionText: 'Open Messages'
      }
    })
  } catch (err) {
    console.error('[messages-email] sendDigestEmail failed:', err)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
