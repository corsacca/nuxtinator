import { sql } from 'kysely'
import { db } from '#core/server/utils/database'

// Reaps this layer's transient rows. Mirrors the oauth layer's oauth-cleanup.ts.
//   * feedback_auth_codes — the token endpoint deletes a code the moment it's
//     claimed, so a successful sign-in leaves nothing behind; only codes minted
//     but never exchanged linger. They hold an encrypted session token at rest,
//     so we don't keep them. Codes live 60s; an hourly sweep keeps a trickle.
//   * activity_logs `ratelimit.feedback.*` — per-request rate-limit bookkeeping
//     (see server/utils/rate-limit.ts), useless past its ≤1h window. Pruned so
//     it can't grow activity_logs unbounded; ~a day is kept for visibility.
const HOUR = 60 * 60 * 1000

async function sweep() {
  try {
    await db
      .deleteFrom('feedback_auth_codes')
      .where('expires', '<', sql<Date>`now()`)
      .execute()
    await db
      .deleteFrom('activity_logs')
      .where('event_type', 'like', 'ratelimit.feedback.%')
      .where('timestamp', '<', sql<Date>`now() - interval '1 day'`)
      .execute()
  } catch (err) {
    console.error('feedback cleanup sweep failed:', err)
  }
}

export default defineNitroPlugin(() => {
  // Run once shortly after boot, then on cadence.
  setTimeout(sweep, 30_000)
  setInterval(sweep, HOUR)
})
