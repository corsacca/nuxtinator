// GET /api/gmail/_test/message?email=&gmMsgId= — fake transport only: the
// message's current folder, flags and labels as Gmail would see them.
export default defineEventHandler(async (event) => {
  if (!gmailIsFakeTransport()) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const q = getQuery(event)
  const email = String(q.email ?? '')
  const gmMsgId = String(q.gmMsgId ?? '')
  if (!email || !gmMsgId) throw createError({ statusCode: 400, statusMessage: 'email and gmMsgId required' })
  return { message: gmailFakeGetMessage(email, gmMsgId) }
})
