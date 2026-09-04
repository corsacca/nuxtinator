// POST /api/gmail/_test/seed — fake transport only: create an in-memory
// mailbox { email, password, labels?, hideAllMail? }.
import { z } from 'zod'

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  labels: z.array(z.string()).optional(),
  hideAllMail: z.boolean().optional()
})

export default defineEventHandler(async (event) => {
  if (!gmailIsFakeTransport()) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
  gmailFakeSeedMailbox(parsed.data)
  return { ok: true }
})
