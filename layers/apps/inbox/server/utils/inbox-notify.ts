// Staff notifications ride core's notification system (bell + its email
// sweep). The recipient set for broadcasts is "everyone who can open the
// inbox": org members (or all users in single mode) whose roles grant
// inbox.access, plus direct per-user grants. Role permission sets are
// resolved once per distinct role list, not per user.
import type { Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import { getRolePermissions } from '#core/server/utils/rbac'
import { createNotification } from '#core/server/utils/notifications'

type Tx = Transaction<Database>

export async function inboxUsersWithAccess(tx: Tx, orgId: string | null): Promise<string[]> {
  const candidates: { id: string, roles: string[] }[] = []

  if (orgId) {
    const rows = await tx
      .selectFrom('memberships')
      .innerJoin('users', 'users.id', 'memberships.user_id')
      .select(['users.id', 'memberships.roles'])
      .where('memberships.org_id', '=', orgId)
      .execute()
    for (const r of rows) candidates.push({ id: r.id, roles: r.roles ?? [] })
  } else {
    const rows = await tx
      .selectFrom('users')
      .select(['id', 'roles', 'is_admin'])
      .execute()
    for (const r of rows) {
      candidates.push({ id: r.id, roles: r.is_admin ? [...(r.roles ?? []), 'admin'] : (r.roles ?? []) })
    }
  }

  const roleSetCache = new Map<string, boolean>()
  const out = new Set<string>()

  for (const c of candidates) {
    const key = [...c.roles].sort().join(',')
    let allowed = roleSetCache.get(key)
    if (allowed === undefined) {
      const perms = await getRolePermissions(tx, c.roles, orgId)
      allowed = perms.has('inbox.access')
      roleSetCache.set(key, allowed)
    }
    if (allowed) out.add(c.id)
  }

  // Additive per-user grants (core user_permission_grants; RLS scopes the
  // read to the active org in multi mode).
  const granted = await tx
    .selectFrom('user_permission_grants')
    .select('user_id')
    .where('permission', '=', 'inbox.access')
    .execute()
  for (const g of granted) out.add(g.user_id)

  return [...out]
}

// New-mail notice: the assignee gets an immediate email; an unassigned
// conversation raises a bell-only broadcast to everyone with inbox access
// (email 'none' — a busy shared inbox must not mass-mail the whole team).
// The notification body is a plain-text snapshot (subject + excerpt + sender +
// attachment list) — core rows carry title/body/link only, so richer HTML
// would need an inbox-owned mailer.
export async function inboxNotifyNewMessage(
  tx: Tx,
  opts: {
    orgId: string | null
    conversationId: string
    assignedUserId: string | null
    counterparty: string
    subject: string | null
    held: boolean
    // A contact replying to an existing thread reads "New reply"; a brand-new
    // conversation reads "New message".
    isReply?: boolean
    excerpt?: string | null
    senderAddress?: string | null
    attachmentNames?: string[]
  }
): Promise<void> {
  const verb = opts.held ? 'Held message' : (opts.isReply ? 'New reply' : 'New message')
  const title = `${verb} from ${opts.counterparty}`
  const lines: string[] = []
  if (opts.subject) lines.push(opts.subject)
  const excerpt = (opts.excerpt || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  if (excerpt) lines.push(excerpt)
  if (opts.senderAddress) lines.push(`From: ${opts.senderAddress}`)
  if (opts.attachmentNames?.length) lines.push(`Attachments: ${opts.attachmentNames.join(', ')}`)
  const body = lines.length ? lines.join('\n') : null
  const link = `/inbox/${opts.conversationId}`

  if (opts.assignedUserId) {
    await createNotification(tx, {
      userId: opts.assignedUserId,
      appId: 'inbox',
      title,
      body,
      link,
      email: 'immediate'
    })
    return
  }

  const userIds = await inboxUsersWithAccess(tx, opts.orgId)
  if (userIds.length === 0) return
  await createNotification(tx, userIds.map(userId => ({
    userId,
    appId: 'inbox',
    title,
    body,
    link,
    email: 'none' as const
  })))
}

// @mention on an internal note: each mentioned teammate gets a bell + immediate
// email. The caller has already dropped the author (no self-notify). The body
// carries the note text (excerpted) alongside the subject — the recipient
// should see what they were tagged about, not just which thread.
export async function inboxNotifyMention(
  tx: Tx,
  opts: { conversationId: string, mentionedUserIds: string[], actorName: string, subject: string | null, noteExcerpt?: string | null }
): Promise<void> {
  if (!opts.mentionedUserIds.length) return
  const lines: string[] = []
  if (opts.subject) lines.push(opts.subject)
  const excerpt = (opts.noteExcerpt || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  if (excerpt) lines.push(excerpt)
  await createNotification(tx, opts.mentionedUserIds.map(userId => ({
    userId,
    appId: 'inbox',
    title: `${opts.actorName} mentioned you in a note`,
    body: lines.length ? lines.join('\n') : null,
    link: `/inbox/${opts.conversationId}`,
    email: 'immediate' as const
  })))
}
