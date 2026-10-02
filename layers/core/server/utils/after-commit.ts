// Work that must follow a transaction but not hold it open: a slow network
// call (embedding a saved section) shouldn't pin a pool connection for the
// request's whole transaction. `afterCommit(tx, fn)` queues `fn` to run once
// `tx` has committed — before the response goes out, so a client that reads
// right after still sees its effects. `fn` gets a `TxScope` for opening short
// transactions scoped to the same org as `tx`.
//
// The tenant kernels open their transactions through `runTransaction`, which
// tracks them. For a transaction opened any other way `fn` runs immediately
// inside it (the old inline behaviour), so queued work is never dropped.
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import { db } from './database'

type Tx = Transaction<Database>

export type TxScope = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>

const pending = new WeakMap<Tx, (() => Promise<void>)[]>()

// Short transactions on the default (RLS) client, with `orgId` as the GUC.
export function txScopeFor(orgId: string | null): TxScope {
  return async fn => await db.transaction().execute(async (tx) => {
    if (orgId) await sql`select set_config('app.current_org', ${orgId}, true)`.execute(tx)
    return await fn(tx)
  })
}

// A TxScope for the org `tx` is scoped to (none in single mode).
export async function txScopeOf(tx: Tx): Promise<TxScope> {
  const res = await sql<{ org: string | null }>`select nullif(current_setting('app.current_org', true), '') as org`.execute(tx)
  return txScopeFor(res.rows[0]?.org ?? null)
}

export async function afterCommit(tx: Tx, fn: (scope: TxScope) => Promise<void>): Promise<void> {
  const queue = pending.get(tx)
  if (!queue) {
    await fn(async inner => await inner(tx))
    return
  }
  const scope = await txScopeOf(tx)
  queue.push(() => fn(scope))
}

// `client.transaction().execute(fn)`, then the work `fn` queued with
// afterCommit. A failing hook is logged, never thrown: the transaction has
// already committed, so the request did succeed.
export async function runTransaction<T>(client: Kysely<Database>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const queue: (() => Promise<void>)[] = []
  const result = await client.transaction().execute(async (tx) => {
    pending.set(tx, queue)
    return await fn(tx)
  })
  for (const hook of queue) {
    try {
      await hook()
    } catch (err) {
      console.error('[after-commit] hook failed:', err)
    }
  }
  return result
}
