import { sql } from 'kysely'
import { db } from '#core/server/utils/database'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const WEEK = 7 * DAY

async function hourlySweep() {
  try {
    await db.deleteFrom('oauth_authorization_codes').where('expires', '<', sql<Date>`now()`).execute()
    await db.deleteFrom('oauth_pending_requests').where('expires', '<', sql<Date>`now()`).execute()
  } catch (err) {
    console.error('oauth hourly sweep failed:', err)
  }
}

async function dailySweep() {
  try {
    await db.deleteFrom('oauth_access_tokens').where('expires', '<', sql<Date>`now()`).execute()
    await db.deleteFrom('oauth_refresh_tokens').where('expires', '<', sql<Date>`now()`).execute()
  } catch (err) {
    console.error('oauth daily sweep failed:', err)
  }
}

async function weeklySweep() {
  // Delete families older than 35 days where no live token remains in either token table.
  try {
    await sql`
      DELETE FROM oauth_token_families f
      WHERE f.created < now() - interval '35 days'
        AND NOT EXISTS (
          SELECT 1 FROM oauth_access_tokens t
          WHERE t.family_id = f.family_id
            AND t.revoked = false
            AND t.expires > now()
        )
        AND NOT EXISTS (
          SELECT 1 FROM oauth_refresh_tokens r
          WHERE r.family_id = f.family_id
            AND r.revoked = false
            AND r.expires > now()
        )
    `.execute(db)
  } catch (err) {
    console.error('oauth weekly sweep failed:', err)
  }
}

export default defineNitroPlugin(() => {
  const cfg = useRuntimeConfig()
  if (!cfg.public?.siteUrl) return

  // Run once shortly after boot, then on cadence.
  setTimeout(() => {
    hourlySweep()
    dailySweep()
  }, 30_000)

  setInterval(hourlySweep, HOUR)
  setInterval(dailySweep, DAY)
  setInterval(weeklySweep, WEEK)
})
