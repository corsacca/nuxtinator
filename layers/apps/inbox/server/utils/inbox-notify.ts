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
export async function inboxNotifyNewMessage(
  tx: Tx,
  opts: {
    orgId: string | null
    conversationId: string
    assignedUserId: string | null
    counterparty: string
    subject: string | null
    held: boolean
  }
): Promise<void> {
  const title = opts.held
    ? `Held message from ${opts.counterparty}`
    : `New message from ${opts.counterparty}`
  const body = opts.subject || null
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
