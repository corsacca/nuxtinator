// POST /api/gmail/_test/sweep — fake transport only: run the session tick,
// wake sweep and send sweep immediately so tests never wait on a cron.
import { db } from '#core/server/utils/database'

export default defineEventHandler(async () => {
  if (!gmailIsFakeTransport()) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  await gmailSyncTick()
  const woke = await gmailRunWakeSweep(db)
  const sent = await gmailRunSendSweep()
  return { woke, sent }
})
