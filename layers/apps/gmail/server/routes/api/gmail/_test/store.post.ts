// POST /api/gmail/_test/store — fake transport only: change flags/labels on
// a message as another Gmail client would.
import { z } from 'zod'

const Body = z.object({
  email: z.string().email(),
  gmMsgId: z.string(),
  addFlags: z.array(z.string()).optional(),
  removeFlags: z.array(z.string()).optional(),
  addLabels: z.array(z.string()).optional(),
  removeLabels: z.array(z.string()).optional()
})

export default defineEventHandler(async (event) => {
  if (!gmailIsFakeTransport()) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
  const { email, gmMsgId, ...change } = parsed.data
  return { ok: gmailFakeStore(email, gmMsgId, change) }
})
