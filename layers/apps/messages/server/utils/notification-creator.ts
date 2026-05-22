// Builds messages-flavored notification snapshots and writes them to the
// global store via core's `createNotification`. The messages layer no longer
// owns a notifications table — it just assembles finished title/body/link text
// and a per-kind email mode, then hands rows to core.
//
//   mention / dm     → emailed immediately
//   comment / reply  → rolled into the daily digest

import type { Transaction } from 'kysely'
import { createNotification } from '#core/server/utils/notifications'
import type { Database, NotificationEmailMode } from '#core/server/database/schema'

export type NotificationKind = 'mention' | 'dm' | 'comment' | 'reply'

const KIND_META: Record<NotificationKind, { verb: string, icon: string, email: NotificationEmailMode }> = {
  mention: { verb: 'mentioned you', icon: 'i-lucide-at-sign', email: 'immediate' },
  dm: { verb: 'sent you a message', icon: 'i-lucide-mail', email: 'immediate' },
  comment: { verb: 'commented on a thread', icon: 'i-lucide-message-circle', email: 'digest' },
  reply: { verb: 'replied to a thread', icon: 'i-lucide-message-circle', email: 'digest' }
}

export interface NotifyInput {
  recipients: string[]
  actorId: string
  conversationId: string
  kind: NotificationKind
  bodyMd?: string | null
}

function truncate(s: string, max = 240): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

// Strips markdown link/emphasis syntax for a readable excerpt. Best-effort —
// keeps `[@Name](uuid)` readable as `@Name`, drops code/emphasis markers.
function plainifyExcerpt(md: string): string {
  return md
    .replace(/\[@([^\]\n]+)\]\(([0-9a-f-]{36})\)/g, '@$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .trim()
}

async function loadActorName(tx: Transaction<Database>, actorId: string): Promise<string> {
  const row = await tx
    .selectFrom('users')
    .select('display_name')
    .where('id', '=', actorId)
    .executeTakeFirst()
  return row?.display_name || 'Someone'
}

// Channel → `#name`; DM → null (a "sent you a message in a direct message"
// suffix would read awkwardly).
async function loadChannelLabel(tx: Transaction<Database>, conversationId: string): Promise<string | null> {
  const conv = await tx
    .selectFrom('messages_conversations')
    .select(['kind', 'name'])
    .where('id', '=', conversationId)
    .executeTakeFirst()
  if (!conv || conv.kind !== 'channel') return null
  return conv.name ? `#${conv.name}` : null
}

export async function notifyMessages(tx: Transaction<Database>, input: NotifyInput): Promise<void> {
  const recipients = input.recipients.filter(id => id !== input.actorId)
  if (recipients.length === 0) return

  const meta = KIND_META[input.kind]
  const [actorName, label] = await Promise.all([
    loadActorName(tx, input.actorId),
    loadChannelLabel(tx, input.conversationId)
  ])

  const title = `${actorName} ${meta.verb}${label ? ` in ${label}` : ''}`
  const body = input.bodyMd ? truncate(plainifyExcerpt(input.bodyMd)) : null
  const link = `/messages/${input.conversationId}`

  await createNotification(
    tx,
    recipients.map(uid => ({
      userId: uid,
      appId: 'messages',
      title,
      body,
      icon: meta.icon,
      link,
      actorId: input.actorId,
      email: meta.email
    }))
  )
}
