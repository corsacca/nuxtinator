// Resolves who is notified about new inbox feedback and enqueues the notice.
//
// Recipients come from the project's own `post_meta.notify_user_ids`. A project
// with no list notifies no one. (A configurable default for projects that
// haven't chosen recipients will come from a separate settings system.)
//
// Delivery is intentionally not handled here. Each recipient gets a core
// notification with `email: 'digest'`, and core's daily digest sweep batches
// them into one email per recipient per day — so a busy inbox never produces a
// ping per card, only a daily summary.

import type { Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import { createNotification } from '#core/server/utils/notifications'

function sanitizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const v of value) {
    if (typeof v === 'string' && v && !out.includes(v)) out.push(v)
  }
  return out
}

// The notify list for a project: the user ids stored on the project itself.
export function resolveFeedbackNotifyRecipientIds(
  projectPostMeta: Record<string, any> | null | undefined
): string[] {
  return sanitizeIds(projectPostMeta?.notify_user_ids)
}

export interface NewFeedbackNotice {
  cardTitle: string
  projectName: string | null
  subType: 'bug' | 'idea'
  /** Who submitted, if signed in — never notified about their own submission. */
  actorId: string | null
  projectPostMeta: Record<string, any> | null | undefined
}

// Enqueue a daily-digest notification to each configured recipient. Writes
// inside the caller's transaction so a successful card insert and its notices
// commit together.
export async function notifyNewFeedbackCard(
  tx: Transaction<Database>,
  notice: NewFeedbackNotice
): Promise<void> {
  const recipientIds = resolveFeedbackNotifyRecipientIds(notice.projectPostMeta)
  if (recipientIds.length === 0) return

  const label = notice.subType === 'idea' ? 'idea' : 'bug'
  await createNotification(tx, recipientIds.map(userId => ({
    userId,
    appId: 'feedback',
    title: `New ${label}: ${notice.cardTitle}`,
    body: notice.projectName ? `In ${notice.projectName}` : null,
    link: '/feedback',
    actorId: notice.actorId,
    email: 'digest' as const
  })))
}
