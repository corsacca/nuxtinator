// Org-scope plumbing for the inbox's session-less code paths (webhooks, the
// send sweep). Same pattern as core's notification jobs: iterate org scopes
// and open a transaction per scope with the RLS GUC set via set_config.
// `[null]` in single mode (no GUC). This is the ONLY inbox code that imports
// `db` — every kernel-style function takes the transaction these helpers
// open.
//
// The per-org iteration is O(orgs) per sweep/webhook; fine at current scale.
// If org count grows large, replace with NOTIFY/LISTEN or a non-RLS routing
// table.
import { sql, type Transaction } from 'kysely'
import { db } from '#core/server/utils/database'
import type { Database } from '#core/server/database/schema'
import { getInboxSettings } from './inbox-settings'

function isTenancyMode(): boolean {
  try {
    const cfg = useRuntimeConfig()
    const paths = (cfg.tenancyMigrationPaths as string[] | undefined) ?? []
    return paths.length > 0
  } catch {
    return false
  }
}

// The set of org scopes a sweep must visit. `[null]` in single mode (no
// GUC); one entry per org in multi mode.
export async function inboxListOrgScopes(): Promise<(string | null)[]> {
  if (!isTenancyMode()) return [null]
  // Raw SQL — `orgs` is a tenancy-only table not in core's Kysely schema.
  const res = await sql<{ id: string }>`select id from orgs`.execute(db)
  return res.rows.map(r => r.id)
}

export async function inboxWithScopeTx<T>(
  orgId: string | null,
  fn: (tx: Transaction<Database>) => Promise<T>
): Promise<T> {
  return await db.transaction().execute(async (tx) => {
    if (orgId) {
      await sql`select set_config('app.current_org', ${orgId}, true)`.execute(tx)
    }
    return await fn(tx)
  })
}

// Cross-replica gate: only one process per cluster runs the send sweep. The
// lock is session-scoped, so a crash releases it automatically. The key is a
// committed constant — don't change it without coordinating across
// deployments, and keep it distinct from core's 84100723915584200xx family.
export const INBOX_SEND_SWEEP_LOCK_KEY = '7203914082716530041'

export async function inboxWithAdvisoryLock(
  key: string,
  label: string,
  fn: () => Promise<void>,
  staleAfterMs = 5 * 60 * 1000
): Promise<void> {
  // Session-scoped lock ops must share ONE pinned connection: `db` is a pool,
  // and if acquire and unlock ran as independent queries they could land on
  // different sessions — the unlock would no-op ("you don't own a lock"
  // warning) and the lock would stay held by the acquiring session, silently
  // skipping every later run until the pool happens to reuse that session.
  // The pinned connection sits idle while fn() runs (fn opens its own
  // transactions from the pool); it only anchors the lock.
  //
  // A crash closes the socket and frees the lock, but an orphaned connection
  // doesn't: a dev hot-reload (or a hung fn) leaves the session open and the
  // lock held for the life of the process, so every later run skips. The
  // idle_session_timeout makes Postgres drop the anchor once it has sat idle
  // for staleAfterMs, freeing the lock. Losing the lock mid-run only risks an
  // overlapping sweep, which per-message claims already make safe.
  await db.connection().execute(async (conn) => {
    const lockRow = await sql<{ got: boolean }>`
      select pg_try_advisory_lock(${sql.raw(key)}::bigint) as got
    `.execute(conn)
    if (!lockRow.rows[0]?.got) {
      console.log(`[inbox] another replica holds the ${label} lock — skipping`)
      return
    }
    try {
      await sql`select set_config('idle_session_timeout', ${String(staleAfterMs)}, false)`.execute(conn)
      await fn()
    } finally {
      // The session may already be gone (timed out above); its lock went with it.
      await sql`select pg_advisory_unlock(${sql.raw(key)}::bigint), set_config('idle_session_timeout', '0', false)`
        .execute(conn)
        .catch(() => {})
    }
  })
}

// Resolve which org's inbox a tokenless inbound recipient belongs to, by
// matching the recipient domain against each org scope's inbound-domain
// setting. Returns the matching scope (null = single-mode/no-org scope), or
// undefined when no scope — or more than one — matches. Ambiguity means two
// orgs claim the same domain, which is unsupported config: the mail is
// ignored with a loud log rather than guessed at.
export async function inboxResolveOrgForRecipientDomain(domain: string): Promise<string | null | undefined> {
  const wanted = domain.toLowerCase()
  const matches: (string | null)[] = []
  for (const scope of await inboxListOrgScopes()) {
    const settings = await inboxWithScopeTx(scope, tx => getInboxSettings(tx))
    if (settings.inboundDomain && settings.inboundDomain === wanted) {
      matches.push(scope)
    }
  }
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    console.error(`[inbox] recipient domain "${wanted}" matches ${matches.length} org scopes — shared inbound domains are unsupported; ignoring the message`)
  }
  return undefined
}

// Resolve which org a contact-form submission belongs to by matching the
// presented API key against each scope's `contact_form_api_key` setting. Same
// scope-scan shape as domain routing; returns undefined when no scope (or more
// than one) matches, so an unknown/duplicate key is rejected rather than
// guessed. An empty key never matches (the form is disabled by default).
export async function inboxResolveOrgForApiKey(key: string): Promise<string | null | undefined> {
  if (!key) return undefined
  const matches: (string | null)[] = []
  for (const scope of await inboxListOrgScopes()) {
    const settings = await inboxWithScopeTx(scope, tx => getInboxSettings(tx))
    if (settings.contactFormApiKey && settings.contactFormApiKey === key) {
      matches.push(scope)
    }
  }
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    console.error('[inbox] contact-form API key matches multiple org scopes — keys must be unique; ignoring the submission')
  }
  return undefined
}
