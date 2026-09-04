// Background work: the session tick (start/stop IMAP sessions per account),
// the snooze wake sweep, and the outbound send sweep. Cadences come from
// runtimeConfig so tests can shrink them. `protect: true` prevents same-
// process overlap; cross-replica safety is the account lease for sessions
// and the atomic claim on draft rows for sends.
import { Cron } from 'croner'
import { db } from '#core/server/utils/database'
import { gmailStopAllSessions, gmailSyncTick } from '../utils/gmail-session-manager'
import { gmailRunWakeSweep } from '../utils/gmail-snooze'
import { gmailRunSendSweep } from '../utils/gmail-send'

// Sweeps can fire before the migrations plugin has created the tables on a
// first boot; that is a wait, not a failure worth a stack trace.
function report(label: string, err: unknown): void {
  if ((err as { code?: string })?.code === '42P01') {
    console.log(`[gmail] ${label} waiting for migrations`)
    return
  }
  console.error(`[gmail] ${label} error:`, err)
}

function clampSeconds(raw: unknown, fallback: number, min: number, max: number): number {
  const n = parseInt(String(raw || ''), 10)
  return Math.min(Math.max(Number.isFinite(n) ? n : fallback, min), max)
}

export default defineNitroPlugin((nitroApp) => {
  // Don't run crons in build / prepare / typecheck contexts.
  if (process.env.NUXT_PREPARE_BUILD || process.env.NITRO_PRESET === 'prepare') return

  const config = useRuntimeConfig()
  const tickSeconds = clampSeconds(config.gmailSyncTickSeconds, 30, 2, 300)
  const sendSeconds = clampSeconds(config.gmailSendSweepSeconds, 5, 1, 300)

  const jobs = [
    new Cron(`*/${tickSeconds} * * * * *`, { protect: true }, () => {
      void gmailSyncTick().catch(err => report('session tick', err))
    }),
    new Cron('*/30 * * * * *', { protect: true }, () => {
      void gmailRunWakeSweep(db).catch(err => report('wake sweep', err))
    }),
    new Cron(`*/${sendSeconds} * * * * *`, { protect: true }, () => {
      void gmailRunSendSweep().catch(err => report('send sweep', err))
    })
  ]

  nitroApp.hooks.hook('close', async () => {
    for (const job of jobs) job.stop()
    await gmailStopAllSessions()
  })

  console.log(`[gmail] sweeps started — session tick ${tickSeconds}s, send sweep ${sendSeconds}s`)
})
