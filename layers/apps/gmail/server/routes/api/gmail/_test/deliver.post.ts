// POST /api/gmail/_test/deliver — fake transport only: drop a message into a
// seeded mailbox. Body: { email, message: GmailFakeSeedMessage }.
import { z } from 'zod'

const Address = z.union([z.string(), z.object({ name: z.string().nullable().optional(), address: z.string() })])

const Body = z.object({
  email: z.string().email(),
  message: z.object({
    from: Address,
    to: z.array(Address).optional(),
    cc: z.array(Address).optional(),
    subject: z.string().optional(),
    text: z.string().optional(),
    html: z.string().nullable().optional(),
    date: z.string().optional(),
    messageId: z.string().optional(),
    inReplyTo: z.string().nullable().optional(),
    references: z.string().nullable().optional(),
    labels: z.array(z.string()).optional(),
    flags: z.array(z.string()).optional(),
    folder: z.enum(['all', 'trash', 'spam']).optional(),
    gmThrId: z.string().optional(),
    attachments: z.array(z.object({ filename: z.string(), contentType: z.string(), content: z.string(), encoding: z.enum(['utf8', 'base64']).optional() })).optional()
  })
})

export default defineEventHandler(async (event) => {
  if (!gmailIsFakeTransport()) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
  const m = parsed.data.message
  const seed = {
    ...m,
    from: typeof m.from === 'string' ? m.from : { name: m.from.name ?? null, address: m.from.address },
    to: m.to?.map(a => (typeof a === 'string' ? a : { name: a.name ?? null, address: a.address })),
    cc: m.cc?.map(a => (typeof a === 'string' ? a : { name: a.name ?? null, address: a.address }))
  }
  return await gmailFakeDeliver(parsed.data.email, seed)
})
