// GET /api/gmail/_test/sent?email= — fake transport only: mail sent through SMTP.
export default defineEventHandler(async (event) => {
  if (!gmailIsFakeTransport()) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const email = String(getQuery(event).email ?? '')
  if (!email) throw createError({ statusCode: 400, statusMessage: 'email required' })
  return {
    sent: gmailFakeListSent(email).map(m => ({
      from: m.from,
      to: m.to,
      cc: m.cc,
      bcc: m.bcc,
      subject: m.subject,
      html: m.html,
      text: m.text,
      messageId: m.messageId,
      inReplyTo: m.inReplyTo,
      references: m.references,
      attachments: m.attachments.map(a => ({ filename: a.filename, contentType: a.contentType, size: a.content.length }))
    }))
  }
})
