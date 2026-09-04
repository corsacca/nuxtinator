// POST /api/gmail/_test/reset — fake transport only: stop sessions and wipe
// every in-memory mailbox.
export default defineEventHandler(async () => {
  if (!gmailIsFakeTransport()) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  gmailFakeReset()
  return { ok: true }
})
