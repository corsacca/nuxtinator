// Given a set of mention nodes from a freshly-created item or comment,
// validate the mentioned users are org members and write the
// `messages_mentions` rows. Returns the validated targets so the caller can
// create the global notifications (with the message body for the excerpt).

import type { Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import type { ExtractedMention } from './markdown-mentions'

export interface MentionFanoutOpts {
  orgId: string | null
  authorId: string
  conversationId: string
  itemId?: string | null
  commentId?: string | null
  // For DMs: mentions of non-members are no-ops. Pass the conversation member
  // set when the conversation is a DM; null/undefined when it's a channel.
  dmMemberIds?: Set<string> | null
}

export async function fanoutMentions(
  tx: Transaction<Database>,
  mentions: ExtractedMention[],
  opts: MentionFanoutOpts
): Promise<{ notified: string[] }> {
  if (mentions.length === 0) return { notified: [] }

  // Resolve which mentioned IDs are real users in this org. In single mode
  // (orgId == null) we only check that they're real users.
  let valid: string[]
  if (opts.orgId) {
    const memberRows = await tx
      .selectFrom('memberships')
      .select('user_id')
      .where('user_id', 'in', mentions.map(m => m.id))
      .where('org_id', '=', opts.orgId)
      .execute()
    valid = memberRows.map(r => r.user_id)
  } else {
    const userRows = await tx
      .selectFrom('users')
      .select('id')
      .where('id', 'in', mentions.map(m => m.id))
      .execute()
    valid = userRows.map(r => r.id)
  }

  // DM-member filter: a mention of someone not in the DM doesn't notify.
  if (opts.dmMemberIds) {
    valid = valid.filter(id => opts.dmMemberIds!.has(id))
  }

  // Don't notify the author themselves.
  const targets = valid.filter(id => id !== opts.authorId)
  if (targets.length === 0) return { notified: [] }

  // Insert mention rows.
  await tx
    .insertInto('messages_mentions')
    .values(targets.map(uid => ({
      item_id: opts.itemId ?? null,
      comment_id: opts.commentId ?? null,
      mentioned_user_id: uid
    })))
    .execute()

  return { notified: targets }
}
