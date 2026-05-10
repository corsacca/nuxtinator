// POST /api/videos/share/:token/play
// PUBLIC — bump play_count for a public video. Implemented via the
// SECURITY DEFINER `bump_video_counter` SQL function so the no-GUC path
// can write past the RLS write policy.

import { sql } from 'kysely'
import { db } from '#core/server/utils/database'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, message: 'Share token is required' })

  await sql`SELECT bump_video_counter(${token}, 'play')`.execute(db)

  return { success: true }
})
