// The unified thread list, per-view counts, thread detail, and the triage
// actions. Every action writes through to Gmail over the account's session
// first, then mirrors the change locally so the UI updates without waiting
// for the next sync pass.
import { sql, type Kysely, type Selectable, type Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import type { GmailAddress, GmailAttachmentMeta, GmailFolderKey, GmailMessagesTable } from '../database/schema'
import { gmailGetAccountById, type GmailAccountRow } from './gmail-accounts'
import { gmailRunOnAccountSession } from './gmail-session-manager'
import { gmailSnoozeThread, gmailWakeThreads } from './gmail-snooze'
import { gmailRecomputeThreads } from './gmail-sync'
import type { GmailSession } from './gmail-transport'

type Db = Kysely<Database> | Transaction<Database>
type MessageRow = Selectable<GmailMessagesTable>

export const GMAIL_VIEWS = ['inbox', 'starred', 'snoozed', 'sent', 'spam', 'trash', 'all'] as const
export type GmailView = typeof GMAIL_VIEWS[number]

export interface GmailThreadFilters {
  userId: string
  view: GmailView
  accountId?: string | null
  label?: string | null
  q?: string | null
  // Restrict to these thread ids (Gmail search passthrough results).
  threadIds?: string[] | null
  limit: number
  offset: number
}

export interface GmailThreadListRow {
  id: string
  accountId: string
  accountEmail: string
  subject: string | null
  snippet: string | null
  participants: GmailAddress[]
  messageCount: number
  unreadCount: number
  hasAttachments: boolean
  isStarred: boolean
  inInbox: boolean
  labels: string[]
  lastMessageAt: string | null
  sortAt: string
  snoozedUntil: string | null
  wokenAt: string | null
}

function applyView<Q extends { where: (...args: never[]) => Q }>(q: Q, view: GmailView): Q {
  // Kysely's builder type is preserved through `where` calls; the sql
  // fragments keep the filters independent of column typing.
  const w = q as unknown as { where: (expr: unknown) => Q }
  switch (view) {
    case 'inbox':
      return w.where(sql`t.in_inbox AND t.spam_count = 0 AND t.trash_count < t.message_count AND t.snoozed_until IS NULL`)
    case 'starred':
      return w.where(sql`t.is_starred AND t.spam_count = 0`)
    case 'snoozed':
      return w.where(sql`t.snoozed_until IS NOT NULL`)
    case 'sent':
      return w.where(sql`t.has_sent AND t.spam_count = 0 AND t.trash_count < t.message_count`)
    case 'spam':
      return w.where(sql`t.spam_count > 0`)
    case 'trash':
      return w.where(sql`t.trash_count > 0`)
    case 'all':
    default:
      return w.where(sql`t.spam_count = 0 AND t.trash_count < t.message_count`)
  }
}

function baseQuery(db: Db, f: GmailThreadFilters) {
  let q = db
    .selectFrom('gmail_threads as t')
    .innerJoin('gmail_accounts as a', 'a.id', 't.account_id')
    .where('t.user_id', '=', f.userId)
  q = applyView(q, f.view)
  if (f.accountId) q = q.where('t.account_id', '=', f.accountId)
  if (f.label) q = q.where(sql<boolean>`${f.label} = ANY(t.labels)`)
  if (f.threadIds) q = f.threadIds.length ? q.where('t.id', 'in', f.threadIds) : q.where(sql<boolean>`false`)
  if (f.q && f.q.trim()) {
    const needle = `%${f.q.trim().toLowerCase()}%`
    q = q.where(sql<boolean>`EXISTS (
      SELECT 1 FROM gmail_messages m
      WHERE m.thread_id = t.id AND (
        lower(coalesce(m.subject, '')) LIKE ${needle}
        OR lower(coalesce(m.from_name, '')) LIKE ${needle}
        OR lower(coalesce(m.from_addr, '')) LIKE ${needle}
        OR lower(coalesce(m.snippet, '')) LIKE ${needle}
      )
    )`)
  }
  return q
}

export async function gmailListThreads(db: Db, f: GmailThreadFilters): Promise<{ items: GmailThreadListRow[], total: number }> {
  const rows = await baseQuery(db, f)
    .select([
      't.id', 't.account_id', 'a.email as account_email', 't.subject', 't.snippet', 't.participants', 't.message_count',
      't.unread_count', 't.has_attachments', 't.is_starred', 't.in_inbox', 't.labels', 't.last_message_at', 't.sort_at',
      't.snoozed_until', 't.woken_at'
    ])
    .orderBy(f.view === 'snoozed' ? 't.snoozed_until' : 't.sort_at', f.view === 'snoozed' ? 'asc' : 'desc')
    .orderBy('t.id', 'asc')
    .limit(f.limit)
    .offset(f.offset)
    .execute()
  const count = await baseQuery(db, f)
    .select(sql<number>`count(*)::int`.as('n'))
    .executeTakeFirst()
  return {
    items: rows.map(r => ({
      id: r.id,
      accountId: r.account_id,
      accountEmail: r.account_email,
      subject: r.subject,
      snippet: r.snippet,
      participants: r.participants,
      messageCount: r.message_count,
      unreadCount: r.unread_count,
      hasAttachments: r.has_attachments,
      isStarred: r.is_starred,
      inInbox: r.in_inbox,
      labels: r.labels,
      lastMessageAt: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
      sortAt: new Date(r.sort_at).toISOString(),
      snoozedUntil: r.snoozed_until ? new Date(r.snoozed_until).toISOString() : null,
      wokenAt: r.woken_at ? new Date(r.woken_at).toISOString() : null
    })),
    total: count?.n ?? 0
  }
}

export interface GmailCounts {
  inboxUnread: number
  inboxTotal: number
  snoozed: number
  spamUnread: number
  drafts: number
  perAccount: { accountId: string, inboxUnread: number }[]
}

export async function gmailThreadCounts(db: Db, userId: string): Promise<GmailCounts> {
  const totals = await sql<{ inbox_unread: number, inbox_total: number, snoozed: number, spam_unread: number }>`
    SELECT
      (count(*) FILTER (WHERE t.in_inbox AND t.spam_count = 0 AND t.trash_count < t.message_count AND t.snoozed_until IS NULL AND t.unread_count > 0))::int AS inbox_unread,
      (count(*) FILTER (WHERE t.in_inbox AND t.spam_count = 0 AND t.trash_count < t.message_count AND t.snoozed_until IS NULL))::int AS inbox_total,
      (count(*) FILTER (WHERE t.snoozed_until IS NOT NULL))::int AS snoozed,
      (count(*) FILTER (WHERE t.spam_count > 0 AND EXISTS (
        SELECT 1 FROM gmail_messages m WHERE m.thread_id = t.id AND m.folder = 'spam' AND NOT ('\\Seen' = ANY(m.flags))
      )))::int AS spam_unread
    FROM gmail_threads t
    WHERE t.user_id = ${userId}
  `.execute(db)
  const perAccount = await sql<{ account_id: string, inbox_unread: number }>`
    SELECT t.account_id, (count(*) FILTER (WHERE t.unread_count > 0))::int AS inbox_unread
    FROM gmail_threads t
    WHERE t.user_id = ${userId} AND t.in_inbox AND t.spam_count = 0 AND t.trash_count < t.message_count AND t.snoozed_until IS NULL
    GROUP BY t.account_id
  `.execute(db)
  const drafts = await db
    .selectFrom('gmail_drafts')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('user_id', '=', userId)
    .where('status', 'in', ['draft', 'queued', 'failed'])
    .executeTakeFirst()
  const t = totals.rows[0]
  return {
    inboxUnread: t?.inbox_unread ?? 0,
    inboxTotal: t?.inbox_total ?? 0,
    snoozed: t?.snoozed ?? 0,
    spamUnread: t?.spam_unread ?? 0,
    drafts: drafts?.n ?? 0,
    perAccount: perAccount.rows.map(r => ({ accountId: r.account_id, inboxUnread: r.inbox_unread }))
  }
}

// --- Detail ------------------------------------------------------------------

export interface GmailThreadMessageView {
  id: string
  folder: GmailFolderKey
  messageId: string | null
  fromName: string | null
  fromAddr: string | null
  to: GmailAddress[]
  cc: GmailAddress[]
  bcc: GmailAddress[]
  replyTo: GmailAddress[]
  subject: string | null
  snippet: string | null
  internalDate: string
  labels: string[]
  isUnread: boolean
  isStarred: boolean
  hasAttachments: boolean
  bodyFetched: boolean
  bodyHtml: string | null
  bodyText: string | null
  attachments: GmailAttachmentMeta[]
}

export interface GmailThreadDetail {
  thread: GmailThreadListRow & { isImportant: boolean, hasSent: boolean, spamCount: number, trashCount: number }
  messages: GmailThreadMessageView[]
}

function messageView(m: MessageRow): GmailThreadMessageView {
  return {
    id: m.id,
    folder: m.folder,
    messageId: m.message_id,
    fromName: m.from_name,
    fromAddr: m.from_addr,
    to: m.to_json,
    cc: m.cc_json,
    bcc: m.bcc_json,
    replyTo: m.reply_to_json,
    subject: m.subject,
    snippet: m.snippet,
    internalDate: new Date(m.internal_date).toISOString(),
    labels: m.labels,
    isUnread: !m.flags.includes('\\Seen'),
    isStarred: m.flags.includes('\\Flagged'),
    hasAttachments: m.has_attachments,
    bodyFetched: !!m.body_fetched_at,
    bodyHtml: m.body_html,
    bodyText: m.body_text,
    attachments: m.attachments
  }
}

export async function gmailGetThread(db: Db, userId: string, threadId: string): Promise<GmailThreadDetail | null> {
  const t = await db
    .selectFrom('gmail_threads as t')
    .innerJoin('gmail_accounts as a', 'a.id', 't.account_id')
    .selectAll('t')
    .select('a.email as account_email')
    .where('t.id', '=', threadId)
    .where('t.user_id', '=', userId)
    .executeTakeFirst()
  if (!t) return null
  const messages = await db
    .selectFrom('gmail_messages')
    .selectAll()
    .where('thread_id', '=', threadId)
    .orderBy('internal_date', 'asc')
    .orderBy('id', 'asc')
    .execute()
  return {
    thread: {
      id: t.id,
      accountId: t.account_id,
      accountEmail: t.account_email,
      subject: t.subject,
      snippet: t.snippet,
      participants: t.participants,
      messageCount: t.message_count,
      unreadCount: t.unread_count,
      hasAttachments: t.has_attachments,
      isStarred: t.is_starred,
      inInbox: t.in_inbox,
      labels: t.labels,
      lastMessageAt: t.last_message_at ? new Date(t.last_message_at).toISOString() : null,
      sortAt: new Date(t.sort_at).toISOString(),
      snoozedUntil: t.snoozed_until ? new Date(t.snoozed_until).toISOString() : null,
      wokenAt: t.woken_at ? new Date(t.woken_at).toISOString() : null,
      isImportant: t.is_important,
      hasSent: t.has_sent,
      spamCount: t.spam_count,
      trashCount: t.trash_count
    },
    messages: messages.map(messageView)
  }
}

// --- Actions ------------------------------------------------------------------

export const GMAIL_THREAD_ACTIONS = [
  'archive', 'move_to_inbox', 'mark_read', 'mark_unread', 'star', 'unstar',
  'trash', 'untrash', 'spam', 'not_spam', 'delete_forever',
  'add_label', 'remove_label', 'snooze', 'unsnooze'
] as const
export type GmailThreadAction = typeof GMAIL_THREAD_ACTIONS[number]

export interface GmailThreadActionOpts {
  label?: string
  wakeAt?: Date
}

export class GmailActionError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message)
    this.name = 'GmailActionError'
  }
}

function byFolder(msgs: MessageRow[]): Map<GmailFolderKey, MessageRow[]> {
  const map = new Map<GmailFolderKey, MessageRow[]>()
  for (const m of msgs) {
    if (m.uid <= 0) continue
    const list = map.get(m.folder) ?? []
    list.push(m)
    map.set(m.folder, list)
  }
  return map
}

async function forEachFolder(session: GmailSession, account: GmailAccountRow, groups: Map<GmailFolderKey, MessageRow[]>, fn: (uids: number[]) => Promise<void>): Promise<void> {
  for (const [folder, msgs] of groups) {
    const path = account.folders?.[folder]
    if (!path) continue
    await session.openFolder(path)
    await fn(msgs.map(m => m.uid))
  }
}

// Moves each folder group to `destination` and records the UID the message
// now has there (from COPYUID). A message whose new UID is unknown is left at
// uid 0 until the next sync pass resolves it by X-GM-MSGID.
async function moveMessages(
  tx: Transaction<Database>,
  session: GmailSession,
  account: GmailAccountRow,
  msgs: MessageRow[],
  destination: string,
  localFolder: GmailFolderKey,
  addLabel?: string
): Promise<void> {
  for (const [folder, group] of byFolder(msgs)) {
    const path = account.folders?.[folder]
    if (!path) continue
    await session.openFolder(path)
    const map = await session.move(group.map(m => m.uid), destination)
    if (addLabel) {
      const landed = group.map(m => map.get(m.uid)).filter((u): u is number => !!u)
      if (landed.length) {
        await session.openFolder(destination)
        await session.addLabels(landed, [addLabel])
      }
    }
    for (const m of group) {
      await tx
        .updateTable('gmail_messages')
        .set({
          folder: localFolder,
          uid: map.get(m.uid) ?? 0,
          ...(addLabel ? { labels: sql`CASE WHEN ${addLabel} = ANY(labels) THEN labels ELSE array_append(labels, ${addLabel}) END` } : {}),
          updated_at: new Date()
        })
        .where('id', '=', m.id)
        .execute()
    }
  }
}

function latest(msgs: MessageRow[]): MessageRow | null {
  return msgs.reduce<MessageRow | null>((best, m) => (!best || new Date(m.internal_date) > new Date(best.internal_date) ? m : best), null)
}

async function ensureLabelFolder(tx: Transaction<Database>, session: GmailSession, account: GmailAccountRow, label: string): Promise<void> {
  const existing = await tx
    .selectFrom('gmail_labels')
    .select('id')
    .where('account_id', '=', account.id)
    .where('path', '=', label)
    .executeTakeFirst()
  if (existing) return
  await session.createFolder(label)
  await tx
    .insertInto('gmail_labels')
    .values({ account_id: account.id, path: label, name: label.split('/').pop() || label, special_use: null, created_at: new Date() })
    .onConflict(oc => oc.columns(['account_id', 'path']).doNothing())
    .execute()
}

function validateLabel(label: string | undefined): string {
  const l = (label ?? '').trim()
  if (!l || l.length > 100 || l.startsWith('\\') || l.startsWith('[Gmail]') || l.toUpperCase() === 'INBOX') {
    throw new GmailActionError(400, 'Invalid label')
  }
  return l
}

export async function gmailApplyThreadAction(
  tx: Transaction<Database>,
  userId: string,
  threadId: string,
  action: GmailThreadAction,
  opts: GmailThreadActionOpts = {}
): Promise<void> {
  const thread = await tx
    .selectFrom('gmail_threads')
    .selectAll()
    .where('id', '=', threadId)
    .where('user_id', '=', userId)
    .executeTakeFirst()
  if (!thread) throw new GmailActionError(404, 'Thread not found')

  if (action === 'snooze') {
    if (!opts.wakeAt || Number.isNaN(opts.wakeAt.getTime()) || opts.wakeAt.getTime() <= Date.now()) {
      throw new GmailActionError(400, 'Snooze time must be in the future')
    }
    await gmailSnoozeThread(tx, userId, threadId, opts.wakeAt)
    return
  }
  if (action === 'unsnooze') {
    await gmailWakeThreads(tx, [threadId], 'manual')
    return
  }

  const account = await gmailGetAccountById(tx, thread.account_id)
  if (!account?.folders) throw new GmailActionError(409, 'The account is not connected')
  const msgs = await tx.selectFrom('gmail_messages').selectAll().where('thread_id', '=', threadId).execute()
  const inAll = msgs.filter(m => m.folder === 'all')
  const ids = (list: MessageRow[]) => list.map(m => m.id)

  const set = (list: MessageRow[], values: Record<string, unknown>) =>
    list.length ? tx.updateTable('gmail_messages').set({ ...values, updated_at: new Date() }).where('id', 'in', ids(list)).execute() : Promise.resolve()
  const addLabelLocally = (list: MessageRow[], label: string) =>
    set(list, { labels: sql`CASE WHEN ${label} = ANY(labels) THEN labels ELSE array_append(labels, ${label}) END` })
  const removeLabelLocally = (list: MessageRow[], label: string) => set(list, { labels: sql`array_remove(labels, ${label})` })
  const addFlagLocally = (list: MessageRow[], flag: string) =>
    set(list, { flags: sql`CASE WHEN ${flag} = ANY(flags) THEN flags ELSE array_append(flags, ${flag}) END` })
  const removeFlagLocally = (list: MessageRow[], flag: string) => set(list, { flags: sql`array_remove(flags, ${flag})` })

  await gmailRunOnAccountSession(account.id, async (session) => {
    const folders = account.folders!
    switch (action) {
      case 'archive': {
        const targets = inAll.filter(m => m.labels.includes('\\Inbox'))
        await forEachFolder(session, account, byFolder(targets), uids => session.removeLabels(uids, ['\\Inbox']))
        await removeLabelLocally(targets, '\\Inbox')
        break
      }
      case 'move_to_inbox': {
        await forEachFolder(session, account, byFolder(inAll), uids => session.addLabels(uids, ['\\Inbox']))
        await addLabelLocally(inAll, '\\Inbox')
        break
      }
      case 'mark_read': {
        const targets = msgs.filter(m => !m.flags.includes('\\Seen'))
        await forEachFolder(session, account, byFolder(targets), uids => session.addFlags(uids, ['\\Seen']))
        await addFlagLocally(targets, '\\Seen')
        break
      }
      case 'mark_unread': {
        const last = latest(inAll.length ? inAll : msgs)
        const targets = last ? [last] : []
        await forEachFolder(session, account, byFolder(targets), uids => session.removeFlags(uids, ['\\Seen']))
        await removeFlagLocally(targets, '\\Seen')
        break
      }
      case 'star': {
        const last = latest(inAll.length ? inAll : msgs)
        const targets = last ? [last] : []
        await forEachFolder(session, account, byFolder(targets), uids => session.addFlags(uids, ['\\Flagged']))
        await addFlagLocally(targets, '\\Flagged')
        break
      }
      case 'unstar': {
        const targets = msgs.filter(m => m.flags.includes('\\Flagged'))
        await forEachFolder(session, account, byFolder(targets), uids => session.removeFlags(uids, ['\\Flagged']))
        await removeFlagLocally(targets, '\\Flagged')
        break
      }
      case 'trash': {
        await moveMessages(tx, session, account, msgs.filter(m => m.folder !== 'trash'), folders.trash, 'trash')
        break
      }
      case 'untrash': {
        // Back into All Mail (whose UID the mirror stores), then labelled
        // \Inbox so it shows in the inbox again.
        await moveMessages(tx, session, account, msgs.filter(m => m.folder === 'trash'), folders.all, 'all', '\\Inbox')
        break
      }
      case 'spam': {
        await moveMessages(tx, session, account, msgs.filter(m => m.folder !== 'spam'), folders.spam, 'spam')
        break
      }
      case 'not_spam': {
        await moveMessages(tx, session, account, msgs.filter(m => m.folder === 'spam'), folders.all, 'all', '\\Inbox')
        break
      }
      case 'delete_forever': {
        const targets = msgs.filter(m => m.folder === 'trash' || m.folder === 'spam')
        if (!targets.length) throw new GmailActionError(400, 'Only mail in Trash or Spam can be deleted forever')
        await forEachFolder(session, account, byFolder(targets), uids => session.deleteMessages(uids))
        await tx.deleteFrom('gmail_messages').where('id', 'in', ids(targets)).execute()
        break
      }
      case 'add_label': {
        const label = validateLabel(opts.label)
        await ensureLabelFolder(tx, session, account, label)
        await forEachFolder(session, account, byFolder(inAll), uids => session.addLabels(uids, [label]))
        await addLabelLocally(inAll, label)
        break
      }
      case 'remove_label': {
        const label = validateLabel(opts.label)
        const targets = inAll.filter(m => m.labels.includes(label))
        await forEachFolder(session, account, byFolder(targets), uids => session.removeLabels(uids, [label]))
        await removeLabelLocally(targets, label)
        break
      }
    }
  })

  await gmailRecomputeThreads(tx, [threadId])
}

// Gmail search passthrough: runs the query on each account's All Mail and
// maps the hits back to mirrored thread ids.
export async function gmailSearchThreadIds(db: Db, userId: string, query: string, accountId?: string | null): Promise<string[]> {
  const accounts = await db
    .selectFrom('gmail_accounts')
    .select(['id', 'folders'])
    .where('user_id', '=', userId)
    .where('status', '!=', 'error')
    .execute()
  const out = new Set<string>()
  for (const a of accounts) {
    if (accountId && a.id !== accountId) continue
    if (!a.folders?.all) continue
    let msgIds: string[]
    try {
      msgIds = await gmailRunOnAccountSession(a.id, async (session) => {
        await session.openFolder(a.folders!.all)
        const uids = await session.searchRaw(query)
        if (!uids.length) return []
        const metas = await session.fetchMeta(uids.slice(0, 500).join(','), { slim: true })
        return metas.map(m => m.gmMsgId)
      })
    } catch (err) {
      console.error(`[gmail] search failed for account ${a.id}:`, err)
      continue
    }
    if (!msgIds.length) continue
    const rows = await db
      .selectFrom('gmail_messages')
      .select('thread_id')
      .where('account_id', '=', a.id)
      .where('gm_msgid', 'in', msgIds)
      .execute()
    for (const r of rows) out.add(r.thread_id)
  }
  return [...out]
}
