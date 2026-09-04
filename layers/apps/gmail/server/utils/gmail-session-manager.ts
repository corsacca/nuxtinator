// Owns one long-lived IMAP session per connected account on this process.
// Ownership is a lease row on gmail_accounts (claimed and renewed here), so
// several replicas can run the tick and each account still has exactly one
// session. The session auto-IDLEs on All Mail between passes; change events
// mark the account dirty and the loop runs a sync pass, with a periodic
// catch-up as a safety net and an hourly reconciliation.
//
// Request handlers borrow the live session through gmailRunOnAccountSession
// (serialised behind the same mutex the sync loop uses), falling back to a
// short-lived connection when another replica holds the lease.
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { db } from '#core/server/utils/database'
import type { GmailSession } from './gmail-transport'
import { gmailGetTransport } from './gmail-transport-registry'
import { gmailAccountCreds, gmailClaimLease, gmailGetAccountById, gmailReleaseLease, gmailSetAccountState } from './gmail-accounts'
import { gmailSyncAccount, type GmailSyncOutcome } from './gmail-sync'

const HOLDER = `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`
const LEASE_TTL_SECONDS = 90
const LEASE_RENEW_MS = 30_000
const CATCHUP_INTERVAL_MS = 120_000
const RECONCILE_INTERVAL_MS = 60 * 60_000
const EVENT_DEBOUNCE_MS = 500
const RETRY_BACKOFF_MS = [30_000, 60_000, 5 * 60_000, 15 * 60_000]

interface Running {
  accountId: string
  session: GmailSession | null
  stopRequested: boolean
  dirty: boolean
  wake: (() => void) | null
  queue: Promise<unknown>
  lastReconcileAt: number
  done: Promise<void>
}

interface Failure {
  count: number
  nextAt: number
  // updated_at of the account when it failed; a credential change bumps it
  // and lifts an auth hold.
  stamp: string
  authHold: boolean
}

const running = new Map<string, Running>()
const failures = new Map<string, Failure>()
let stopped = false
let tickInFlight: Promise<void> | null = null

function stamp(value: Date | string | null | undefined): string {
  return value ? new Date(value).toISOString() : ''
}

// The stamp is read after the failure was written to the row, so the
// failure's own status write never looks like a credential change.
async function recordFailure(accountId: string, authHold: boolean): Promise<void> {
  const prev = failures.get(accountId)
  const count = (prev?.count ?? 0) + 1
  const backoff = RETRY_BACKOFF_MS[Math.min(count - 1, RETRY_BACKOFF_MS.length - 1)]!
  const fresh = await gmailGetAccountById(db, accountId)
  failures.set(accountId, { count, nextAt: Date.now() + backoff, stamp: stamp(fresh?.updated_at), authHold })
}

function withMutex<T>(r: Running, fn: () => Promise<T>): Promise<T> {
  const next = r.queue.then(fn, fn)
  r.queue = next.catch(() => {})
  return next
}

function waitForChange(r: Running, timeoutMs: number): Promise<void> {
  if (r.dirty || r.stopRequested || stopped) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const timer = setTimeout(finish, timeoutMs)
    function finish() {
      clearTimeout(timer)
      r.wake = null
      resolve()
    }
    r.wake = () => setTimeout(finish, EVENT_DEBOUNCE_MS)
  })
}

async function runSession(r: Running): Promise<void> {
  const account = await gmailGetAccountById(db, r.accountId)
  if (!account) return
  let session: GmailSession
  try {
    session = await gmailGetTransport().connect(gmailAccountCreds(account))
  } catch (err) {
    const auth = (err as Error)?.name === 'GmailAuthError'
    await gmailSetAccountState(db, r.accountId, {
      status: 'error',
      lastError: auth
        ? 'Gmail rejected the app password. Enter a new one in Gmail settings.'
        : `Could not connect to Gmail: ${(err as Error)?.message ?? 'unknown error'}`
    })
    await recordFailure(r.accountId, auth)
    await gmailReleaseLease(db, r.accountId, HOLDER)
    return
  }
  r.session = session
  const unsubscribe = session.onChange(() => {
    r.dirty = true
    r.wake?.()
  })
  let lastRenew = Date.now()
  let lastSyncAt = 0
  let healthy = true
  try {
    while (!r.stopRequested && !stopped && session.usable) {
      const due = r.dirty || Date.now() - lastSyncAt > CATCHUP_INTERVAL_MS
      if (due) {
        const reconcile = Date.now() - r.lastReconcileAt > RECONCILE_INTERVAL_MS
        r.dirty = false
        try {
          await withMutex(r, () => gmailSyncAccount(session, r.accountId, { reconcile }))
          if (reconcile) r.lastReconcileAt = Date.now()
          failures.delete(r.accountId)
        } catch (err) {
          console.error(`[gmail] sync failed for ${account.email}:`, err)
          await gmailSetAccountState(db, r.accountId, { status: 'error', lastError: `Sync failed: ${(err as Error)?.message ?? 'unknown error'}` })
          if (!session.usable) {
            healthy = false
            break
          }
        }
        lastSyncAt = Date.now()
      }
      await waitForChange(r, LEASE_RENEW_MS)
      if (Date.now() - lastRenew >= LEASE_RENEW_MS) {
        if (!(await gmailClaimLease(db, r.accountId, HOLDER, LEASE_TTL_SECONDS))) break
        lastRenew = Date.now()
      }
    }
    if (!session.usable) healthy = false
  } finally {
    unsubscribe()
    r.session = null
    await session.close().catch(() => {})
    await gmailReleaseLease(db, r.accountId, HOLDER).catch(() => {})
  }
  if (!healthy && !r.stopRequested && !stopped) await recordFailure(r.accountId, false)
}

function start(accountId: string): void {
  const r: Running = {
    accountId,
    session: null,
    stopRequested: false,
    dirty: true,
    wake: null,
    queue: Promise.resolve(),
    lastReconcileAt: Date.now(),
    done: Promise.resolve()
  }
  r.done = runSession(r)
    .catch(err => console.error(`[gmail] session crashed for account ${accountId}:`, err))
    .finally(() => {
      if (running.get(accountId) === r) running.delete(accountId)
    })
  running.set(accountId, r)
}

// Reconciles running sessions with the accounts table: stops sessions for
// deleted accounts, claims a lease and starts a session for accounts nobody
// runs, honouring the retry backoff and the auth hold.
export function gmailSyncTick(): Promise<void> {
  if (stopped) return Promise.resolve()
  if (tickInFlight) return tickInFlight
  tickInFlight = runTick().finally(() => {
    tickInFlight = null
  })
  return tickInFlight
}

async function runTick(): Promise<void> {
  const accounts = await db.selectFrom('gmail_accounts').select(['id', 'updated_at']).execute()
  const live = new Set(accounts.map(a => a.id))
  for (const r of running.values()) {
    if (!live.has(r.accountId)) {
      r.stopRequested = true
      r.wake?.()
    }
  }
  for (const a of accounts) {
    if (running.has(a.id)) continue
    const f = failures.get(a.id)
    if (f) {
      const changed = f.stamp !== stamp(a.updated_at)
      if (changed) failures.delete(a.id)
      else if (f.authHold || Date.now() < f.nextAt) continue
    }
    if (!(await gmailClaimLease(db, a.id, HOLDER, LEASE_TTL_SECONDS))) continue
    if (!running.has(a.id)) start(a.id)
  }
}

export async function gmailStopAllSessions(): Promise<void> {
  stopped = true
  const all = [...running.values()]
  for (const r of all) {
    r.stopRequested = true
    r.wake?.()
  }
  await Promise.all(all.map(r => r.done))
}

export function gmailIsSessionRunning(accountId: string): boolean {
  return running.get(accountId)?.session?.usable === true
}

// Runs `fn` against the account's live session when this process owns it,
// otherwise against a temporary connection. The live session is handed back
// on All Mail and flagged dirty so the next pass mirrors whatever `fn` did.
export async function gmailRunOnAccountSession<T>(accountId: string, fn: (session: GmailSession) => Promise<T>): Promise<T> {
  const r = running.get(accountId)
  if (r?.session?.usable) {
    const session = r.session
    return await withMutex(r, async () => {
      try {
        return await fn(session)
      } finally {
        const account = await gmailGetAccountById(db, accountId)
        if (account?.folders?.all && session.usable) await session.openFolder(account.folders.all).catch(() => {})
        r.dirty = true
        r.wake?.()
      }
    })
  }
  const account = await gmailGetAccountById(db, accountId)
  if (!account) throw new Error(`account ${accountId} not found`)
  const session = await gmailGetTransport().connect(gmailAccountCreds(account))
  try {
    return await fn(session)
  } finally {
    await session.close().catch(() => {})
  }
}

// An immediate full pass, for the "Sync now" button and tests.
export async function gmailSyncNow(accountId: string): Promise<GmailSyncOutcome> {
  const r = running.get(accountId)
  if (r?.session?.usable) {
    const session = r.session
    r.dirty = false
    return await withMutex(r, () => gmailSyncAccount(session, accountId, { reconcile: true }))
  }
  const account = await gmailGetAccountById(db, accountId)
  if (!account) throw new Error(`account ${accountId} not found`)
  const session = await gmailGetTransport().connect(gmailAccountCreds(account))
  try {
    return await gmailSyncAccount(session, accountId, { reconcile: true })
  } finally {
    await session.close().catch(() => {})
  }
}
