// Central construction for every Postgres connection the host opens — the
// app_user `db`, the host_admin `adminDb`, the migration runner, the seed
// runner, the bootstrap-admin script, and the test pools. Each call site still
// owns its own URL/role, pool size, timeouts, and lifecycle; this module owns
// only the options that must be identical everywhere, so they can't drift:
//   - ssl posture (see `dbUrlWithSslDefault`)
//   - `prepare: false`, required for PgBouncer transaction mode (server-side
//     prepared statements collide across reused connections)
//   - `onnotice` silenced
// Pure — no Nitro/runtimeConfig deps — so the CLI scripts and vitest helpers
// call it the same way the server runtime does.
//
// postgres.js parses `?sslmode=` off the URL natively (disable | allow | prefer
// | require | verify-ca | verify-full) but defaults to no TLS when it's absent.
// We only inject a `prefer` default so an unconfigured URL auto-negotiates: TLS
// when the server offers it, plaintext when it doesn't. That covers a local
// Postgres with no TLS, a private-network Postgres/PgBouncer that speaks
// plaintext (Docker, Dokploy, Fly internal), and a managed Postgres that
// requires TLS — with no config.
//
// An explicit `?sslmode=` on the URL is left untouched and wins. Use
// `verify-full` (with a CA the server's cert chains to) for real MITM
// protection — `prefer` and `require` encrypt but don't verify the certificate.

import { Kysely } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'

export function dbUrlWithSslDefault(url: string): string {
  if (/[?&]sslmode=/i.test(url)) return url
  return url + (url.includes('?') ? '&' : '?') + 'sslmode=prefer'
}

export function createPgPool(url: string, opts: postgres.Options<{}> = {}) {
  return postgres(dbUrlWithSslDefault(url), { prepare: false, onnotice: () => {}, ...opts })
}

export function createKyselyDb<T>(url: string, opts?: postgres.Options<{}>): Kysely<T> {
  return new Kysely<T>({ dialect: new PostgresJSDialect({ postgres: createPgPool(url, opts) }) })
}
