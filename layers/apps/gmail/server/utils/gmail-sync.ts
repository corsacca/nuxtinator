// The mirror. Per account, per folder (All Mail, Trash, Spam):
//
//   new mail       UIDs above the stored `lastUid`
//   flag/label     CONDSTORE `CHANGEDSINCE highestModseq` (slim fetch); rows
//                  the change touched but the mirror doesn't know get a full
//                  fetch (a move into this folder assigns a fresh UID)
//   backfill       All Mail is walked newest-first in pages across passes;
//                  Trash and Spam are small (30-day purge) and load at once
//   reconcile      hourly UID diff against the server catches missed
//                  expunges and anything IDLE lost
//
// Message identity is (account, X-GM-MSGID) so a move between mirrored
// folders is an update of folder+uid, never a delete+insert, and cached
// bodies survive. Thread rows are aggregates recomputed for every touched
// gm_thrid after each batch.
import { sql, type Kysely, type Transaction } from 'kysely'
import { db } from '#core/server/utils/database'
import type { Database } from '#core/server/database/schema'
import type { GmailFolderKey, GmailFolderSyncState, GmailSyncState } from '../database/schema'
import type { GmailMessageMeta, GmailSession } from './gmail-transport'
import { gmailGetAccountById, gmailSetAccountState, type GmailAccountRow } from './gmail-accounts'
import { gmailRecordAddresses } from './gmail-addresses'
import { gmailWakeThreads } from './gmail-snooze'
import { gmailMakeSnippet } from './gmail-mime'
import { gmailJson } from './gmail-json'

type Db = Kysely<Database> | Transaction<Database>

const BACKFILL_PAGE = 500
const BACKFILL_PAGES_PER_PASS = 4
const SNIPPET_MAX_PER_PASS = 150
const SNIPPET_BYTES = 2048
const SNIPPET_RECENT_DAYS = 30
const RECONCILE_CHUNK = 200
const FOLDER_KEYS: GmailFolderKey[] = ['all', 'trash', 'spam']

export interface GmailSyncOutcome {
  added: number
  updated: number
  removed: number
  backfillDone: boolean
}

function freshFolderState(uidValidity: string | null = null): GmailFolderSyncState {
  return { uidValidity, lastUid: 0, highestModseq: null }
}

function folderPath(account: GmailAccountRow, key: GmailFolderKey): string {
  const path = account.folders?.[key]
  if (!path) throw new Error(`account ${account.id} has no ${key} folder`)
  return path
}

// --- Thread aggregates -------------------------------------------------------

// Recomputes every aggregate column on the given threads from their messages
// and drops threads that no longer have any.
export async function gmailRecomputeThreads(tx: Db, threadIds: string[]): Promise<void> {
  const ids = [...new Set(threadIds)]
  if (!ids.length) return
  await sql`
    WITH agg AS (
      SELECT m.thread_id,
        count(*)::int AS message_count,
        (count(*) FILTER (WHERE m.folder = 'all' AND NOT ('\\Seen' = ANY(m.flags))))::int AS unread_count,
        (count(*) FILTER (WHERE m.folder = 'trash'))::int AS trash_count,
        (count(*) FILTER (WHERE m.folder = 'spam'))::int AS spam_count,
        bool_or(m.has_attachments) AS has_attachments,
        bool_or(m.folder = 'all' AND '\\Inbox' = ANY(m.labels)) AS in_inbox,
        bool_or(m.folder = 'all' AND '\\Flagged' = ANY(m.flags)) AS is_starred,
        bool_or('\\Important' = ANY(m.labels)) AS is_important,
        bool_or(m.folder = 'all' AND '\\Sent' = ANY(m.labels)) AS has_sent,
        min(m.internal_date) AS first_message_at,
        max(m.internal_date) AS last_message_at,
        (array_agg(m.subject ORDER BY m.internal_date ASC) FILTER (WHERE m.subject IS NOT NULL AND m.subject <> ''))[1] AS subject,
        (array_agg(m.snippet ORDER BY m.internal_date DESC) FILTER (WHERE m.snippet IS NOT NULL AND m.snippet <> ''))[1] AS snippet,
        coalesce((
          SELECT array_agg(DISTINCT l)
          FROM gmail_messages m2, unnest(m2.labels) AS l
          WHERE m2.thread_id = m.thread_id AND m2.folder = 'all' AND l NOT LIKE '\\\\%'
        ), '{}'::text[]) AS labels,
        coalesce((
          SELECT jsonb_agg(s.p ORDER BY s.last_at DESC)
          FROM (
            SELECT DISTINCT ON (m3.from_addr)
              jsonb_build_object('name', m3.from_name, 'address', m3.from_addr) AS p,
              m3.internal_date AS last_at
            FROM gmail_messages m3
            WHERE m3.thread_id = m.thread_id AND m3.from_addr IS NOT NULL
            ORDER BY m3.from_addr, m3.internal_date DESC
          ) s
        ), '[]'::jsonb) AS participants
      FROM gmail_messages m
      WHERE m.thread_id = ANY(${ids}::uuid[])
      GROUP BY m.thread_id
    )
    UPDATE gmail_threads t SET
      message_count = agg.message_count,
      unread_count = agg.unread_count,
      trash_count = agg.trash_count,
      spam_count = agg.spam_count,
      has_attachments = agg.has_attachments,
      in_inbox = agg.in_inbox,
      is_starred = agg.is_starred,
      is_important = agg.is_important,
      has_sent = agg.has_sent,
      first_message_at = agg.first_message_at,
      last_message_at = agg.last_message_at,
      subject = agg.subject,
      snippet = agg.snippet,
      labels = agg.labels,
      participants = agg.participants,
      sort_at = GREATEST(agg.last_message_at, coalesce(t.woken_at, agg.last_message_at)),
      updated_at = now()
    FROM agg
    WHERE t.id = agg.thread_id
  `.execute(tx)
  await sql`
    DELETE FROM gmail_threads t
    WHERE t.id = ANY(${ids}::uuid[])
      AND NOT EXISTS (SELECT 1 FROM gmail_messages m WHERE m.thread_id = t.id)
  `.execute(tx)
}

// --- Upserts -----------------------------------------------------------------

async function ensureThreads(tx: Transaction<Database>, account: GmailAccountRow, gmThrIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(gmThrIds)]
  const map = new Map<string, string>()
  if (!ids.length) return map
  const existing = await tx
    .selectFrom('gmail_threads')
    .select(['id', 'gm_thrid'])
    .where('account_id', '=', account.id)
    .where('gm_thrid', 'in', ids)
    .execute()
  for (const r of existing) map.set(r.gm_thrid, r.id)
  const missing = ids.filter(id => !map.has(id))
  if (missing.length) {
    await tx
      .insertInto('gmail_threads')
      .values(missing.map(gm_thrid => ({ account_id: account.id, user_id: account.user_id, gm_thrid, sort_at: new Date(), created_at: new Date(), updated_at: new Date() })))
      .onConflict(oc => oc.columns(['account_id', 'gm_thrid']).doNothing())
      .execute()
    const created = await tx
      .selectFrom('gmail_threads')
      .select(['id', 'gm_thrid'])
      .where('account_id', '=', account.id)
      .where('gm_thrid', 'in', missing)
      .execute()
    for (const r of created) map.set(r.gm_thrid, r.id)
  }
  return map
}

export interface GmailUpsertResult {
  inserted: number
  updated: number
  threadIds: string[]
}

// Writes full metadata rows. `live` marks an incremental pass (as opposed to
// backfill or reconciliation) so a fresh inbound message can wake a snoozed
// thread.
export async function gmailUpsertMessages(
  account: GmailAccountRow,
  folder: GmailFolderKey,
  metas: GmailMessageMeta[],
  opts: { live: boolean }
): Promise<GmailUpsertResult> {
  const full = metas.filter(m => m.envelope)
  if (!full.length) return { inserted: 0, updated: 0, threadIds: [] }
  return await db.transaction().execute(async (tx) => {
    const threadMap = await ensureThreads(tx, account, full.map(m => m.gmThrId))
    let inserted = 0
    let updated = 0
    const wake = new Set<string>()
    for (let i = 0; i < full.length; i += 100) {
      const chunk = full.slice(i, i + 100)
      const rows = await tx
        .insertInto('gmail_messages')
        .values(chunk.map(m => ({
          account_id: account.id,
          thread_id: threadMap.get(m.gmThrId)!,
          gm_msgid: m.gmMsgId,
          gm_thrid: m.gmThrId,
          folder,
          uid: m.uid,
          message_id: m.envelope!.messageId,
          in_reply_to: m.envelope!.inReplyTo,
          from_name: m.envelope!.from[0]?.name ?? null,
          from_addr: m.envelope!.from[0]?.address ?? null,
          to_json: gmailJson(m.envelope!.to),
          cc_json: gmailJson(m.envelope!.cc),
          bcc_json: gmailJson(m.envelope!.bcc),
          reply_to_json: gmailJson(m.envelope!.replyTo),
          subject: m.envelope!.subject,
          internal_date: m.internalDate,
          size_bytes: m.size,
          labels: m.labels,
          flags: m.flags,
          has_attachments: m.hasAttachments,
          text_part: m.textPart,
          html_part: m.htmlPart,
          created_at: new Date(),
          updated_at: new Date()
        })))
        .onConflict(oc => oc.columns(['account_id', 'gm_msgid']).doUpdateSet({
          thread_id: sql`excluded.thread_id`,
          folder: sql`excluded.folder`,
          uid: sql`excluded.uid`,
          labels: sql`excluded.labels`,
          flags: sql`excluded.flags`,
          has_attachments: sql`excluded.has_attachments`,
          text_part: sql`coalesce(excluded.text_part, gmail_messages.text_part)`,
          html_part: sql`coalesce(excluded.html_part, gmail_messages.html_part)`,
          size_bytes: sql`coalesce(excluded.size_bytes, gmail_messages.size_bytes)`,
          updated_at: new Date()
        }))
        .returning([sql<boolean>`(xmax = 0)`.as('inserted'), 'thread_id', 'labels', 'folder'])
        .execute()
      for (const r of rows) {
        if (r.inserted) {
          inserted++
          if (opts.live && r.folder === 'all' && r.labels.includes('\\Inbox') && !r.labels.includes('\\Sent')) wake.add(r.thread_id)
        } else {
          updated++
        }
      }
    }
    if (folder === 'all') {
      await gmailRecordAddresses(tx, account.user_id, full.flatMap(m => [...m.envelope!.from, ...m.envelope!.to, ...m.envelope!.cc]))
    }
    const threadIds = [...new Set([...threadMap.values()])]
    await gmailRecomputeThreads(tx, threadIds)
    if (wake.size) await gmailWakeThreads(tx, [...wake], 'reply')
    return { inserted, updated, threadIds }
  })
}

// Applies slim (flags/labels) changes to known rows; returns the UIDs the
// mirror has never seen in this folder so the caller can fetch them in full.
async function applySlimUpdates(account: GmailAccountRow, folder: GmailFolderKey, metas: GmailMessageMeta[]): Promise<number[]> {
  if (!metas.length) return []
  return await db.transaction().execute(async (tx) => {
    const known = await tx
      .selectFrom('gmail_messages')
      .select(['id', 'gm_msgid', 'thread_id'])
      .where('account_id', '=', account.id)
      .where('gm_msgid', 'in', metas.map(m => m.gmMsgId))
      .execute()
    const byMsgId = new Map(known.map(k => [k.gm_msgid, k]))
    const unknown: number[] = []
    const threadIds = new Set<string>()
    for (const m of metas) {
      const row = byMsgId.get(m.gmMsgId)
      if (!row) {
        unknown.push(m.uid)
        continue
      }
      await tx
        .updateTable('gmail_messages')
        .set({ folder, uid: m.uid, flags: m.flags, labels: m.labels, updated_at: new Date() })
        .where('id', '=', row.id)
        .execute()
      threadIds.add(row.thread_id)
    }
    await gmailRecomputeThreads(tx, [...threadIds])
    return unknown
  })
}

async function fetchByUids(session: GmailSession, uids: number[]): Promise<GmailMessageMeta[]> {
  const out: GmailMessageMeta[] = []
  for (let i = 0; i < uids.length; i += RECONCILE_CHUNK) {
    const chunk = uids.slice(i, i + RECONCILE_CHUNK)
    const metas = await session.fetchMeta(chunk.join(','))
    out.push(...metas.filter(m => chunk.includes(m.uid)))
  }
  return out
}

// --- Folder passes -------------------------------------------------------------

async function syncFolder(
  session: GmailSession,
  account: GmailAccountRow,
  key: GmailFolderKey,
  state: GmailSyncState,
  outcome: GmailSyncOutcome
): Promise<void> {
  const mb = await session.openFolder(folderPath(account, key))
  let st = state[key] ?? freshFolderState()
  if (st.uidValidity && st.uidValidity !== mb.uidValidity) {
    st = freshFolderState()
    if (key === 'all') state.backfillFloor = null
  }

  if (st.lastUid === 0) {
    if (key === 'all') {
      // Everything at or below uidNext-1 is history for the backfill walker;
      // incremental sync owns anything newer from here on.
      st.lastUid = mb.uidNext - 1
      state.backfillFloor = mb.uidNext
    } else if (mb.exists > 0) {
      const metas = await session.fetchMeta('1:*')
      const res = await gmailUpsertMessages(account, key, metas, { live: false })
      outcome.added += res.inserted
      outcome.updated += res.updated
      st.lastUid = Math.max(mb.uidNext - 1, ...metas.map(m => m.uid))
    } else {
      st.lastUid = mb.uidNext - 1
    }
  } else {
    if (mb.uidNext - 1 > st.lastUid) {
      const metas = (await session.fetchMeta(`${st.lastUid + 1}:*`)).filter(m => m.uid > st.lastUid)
      const res = await gmailUpsertMessages(account, key, metas, { live: true })
      outcome.added += res.inserted
      outcome.updated += res.updated
      st.lastUid = Math.max(mb.uidNext - 1, ...metas.map(m => m.uid))
    }
    if (st.highestModseq && mb.highestModseq && mb.highestModseq !== st.highestModseq && st.lastUid > 0) {
      const changed = await session.fetchMeta(`1:${st.lastUid}`, { changedSince: st.highestModseq, slim: true })
      const unknown = await applySlimUpdates(account, key, changed)
      outcome.updated += changed.length - unknown.length
      if (unknown.length) {
        const metas = await fetchByUids(session, unknown)
        const res = await gmailUpsertMessages(account, key, metas, { live: true })
        outcome.added += res.inserted
        outcome.updated += res.updated
      }
    }
  }

  st.uidValidity = mb.uidValidity
  st.highestModseq = mb.highestModseq
  state[key] = st
  await fillSnippets(session, account, key)
}

async function backfillAll(session: GmailSession, account: GmailAccountRow, state: GmailSyncState, outcome: GmailSyncOutcome): Promise<void> {
  let floor = state.backfillFloor
  if (floor === null || floor === undefined) return
  if (floor <= 1) {
    outcome.backfillDone = true
    return
  }
  await session.openFolder(folderPath(account, 'all'))
  for (let page = 0; page < BACKFILL_PAGES_PER_PASS && floor > 1; page++) {
    const hi = floor - 1
    const lo = Math.max(1, hi - BACKFILL_PAGE + 1)
    const metas = (await session.fetchMeta(`${lo}:${hi}`)).filter(m => m.uid >= lo && m.uid <= hi)
    const res = await gmailUpsertMessages(account, 'all', metas, { live: false })
    outcome.added += res.inserted
    outcome.updated += res.updated
    floor = lo
    state.backfillFloor = floor
    await gmailSetAccountState(db, account.id, { syncState: state })
  }
  outcome.backfillDone = floor <= 1
  await fillSnippets(session, account, 'all')
}

// Snippets need a body-part fetch per message, so only inbox mail and the
// last month get them during sync; anything else fills in when it is opened.
async function fillSnippets(session: GmailSession, account: GmailAccountRow, key: GmailFolderKey): Promise<void> {
  const candidates = await db
    .selectFrom('gmail_messages')
    .select(['id', 'uid', 'text_part', 'html_part', 'thread_id'])
    .where('account_id', '=', account.id)
    .where('folder', '=', key)
    .where('uid', '>', 0)
    .where('snippet', 'is', null)
    .where(eb => eb.or([eb('text_part', 'is not', null), eb('html_part', 'is not', null)]))
    .where(eb => eb.or([
      sql<boolean>`'\\Inbox' = ANY(labels)`,
      eb('internal_date', '>', sql<Date>`now() - make_interval(days => ${SNIPPET_RECENT_DAYS})`)
    ]))
    .orderBy('internal_date', 'desc')
    .limit(SNIPPET_MAX_PER_PASS)
    .execute()
  if (!candidates.length) return
  const threadIds = new Set<string>()
  for (const c of candidates) {
    let snippet: string
    try {
      const part = c.text_part ?? c.html_part!
      const raw = await session.fetchPartText(c.uid, part, SNIPPET_BYTES)
      snippet = (c.text_part ? gmailMakeSnippet(raw) : gmailMakeSnippet(null, raw)) ?? ''
    } catch {
      snippet = ''
    }
    await db.updateTable('gmail_messages').set({ snippet }).where('id', '=', c.id).execute()
    threadIds.add(c.thread_id)
  }
  await gmailRecomputeThreads(db, [...threadIds])
}

// --- Reconciliation ------------------------------------------------------------

async function reconcileFolder(session: GmailSession, account: GmailAccountRow, key: GmailFolderKey, outcome: GmailSyncOutcome): Promise<void> {
  await session.openFolder(folderPath(account, key))
  const server = new Set(await session.listUids())
  const local = await db
    .selectFrom('gmail_messages')
    .select(['id', 'uid', 'thread_id'])
    .where('account_id', '=', account.id)
    .where('folder', '=', key)
    .execute()
  const localUids = new Set<number>()
  const gone: { id: string, thread_id: string }[] = []
  for (const row of local) {
    if (row.uid > 0) localUids.add(row.uid)
    if (row.uid > 0 && !server.has(row.uid)) gone.push(row)
  }
  if (gone.length) {
    await db.transaction().execute(async (tx) => {
      await tx.deleteFrom('gmail_messages').where('id', 'in', gone.map(g => g.id)).execute()
      await gmailRecomputeThreads(tx, gone.map(g => g.thread_id))
    })
    outcome.removed += gone.length
  }
  // Rows left at uid 0 by a triage move that the destination folder never
  // reported back are stale after an hour.
  const stale = await db
    .deleteFrom('gmail_messages')
    .where('account_id', '=', account.id)
    .where('folder', '=', key)
    .where('uid', '=', 0)
    .where('updated_at', '<', sql<Date>`now() - interval '1 hour'`)
    .returning('thread_id')
    .execute()
  if (stale.length) await gmailRecomputeThreads(db, stale.map(s => s.thread_id))
  const extra = [...server].filter(uid => !localUids.has(uid))
  if (extra.length) {
    const metas = await fetchByUids(session, extra)
    const res = await gmailUpsertMessages(account, key, metas, { live: false })
    outcome.added += res.inserted
    outcome.updated += res.updated
  }
}

// --- Entry points --------------------------------------------------------------

export async function gmailSyncAccount(session: GmailSession, accountId: string, opts: { reconcile?: boolean } = {}): Promise<GmailSyncOutcome> {
  const account = await gmailGetAccountById(db, accountId)
  if (!account) throw new Error(`account ${accountId} not found`)
  if (!account.folders) throw new Error(`account ${accountId} has no folder map`)
  const state: GmailSyncState = { ...(account.sync_state ?? {}) }
  const outcome: GmailSyncOutcome = { added: 0, updated: 0, removed: 0, backfillDone: account.backfill_done }
  for (const key of FOLDER_KEYS) await syncFolder(session, account, key, state, outcome)
  await backfillAll(session, account, state, outcome)
  if (opts.reconcile) {
    for (const key of FOLDER_KEYS) await reconcileFolder(session, account, key, outcome)
    state.reconciledAt = new Date().toISOString()
  }
  await gmailSetAccountState(db, accountId, {
    status: 'active',
    lastError: null,
    syncState: state,
    backfillDone: outcome.backfillDone,
    lastSyncAt: new Date()
  })
  // Leave All Mail selected so IDLE watches the folder that matters most.
  await session.openFolder(folderPath(account, 'all'))
  return outcome
}
