// Contact-facing courtesy mail: the auto-acknowledgment for brand-new
// conversations and the "we received your message" notice for held senders.
// Both are best-effort fire-and-forget sends (a transient failure is logged,
// not retried — courtesy mail doesn't justify queue durability) and carry RFC
// 3834 autoReply headers so responders don't loop. Callers enforce the
// anti-backscatter gates: authenticated sender only, never to an
// auto-responder/bounce.

export interface InboxCourtesyContext {
  toEmail: string
  toName: string | null
  subject: string | null
  replyToken: string
  contactAddress: string
  appName: string
}

function ackBodyHtml(ctx: InboxCourtesyContext): string {
  const name = ctx.toName ? ` ${ctx.toName.split(/\s+/)[0]}` : ''
  return [
    `<p>Hi${name},</p>`,
    `<p>Thanks for reaching out — your message has been received and someone from our team will get back to you soon.</p>`,
    `<p>You can reply directly to this email to add more details.</p>`
  ].join('\n')
}

function heldBodyHtml(ctx: InboxCourtesyContext): string {
  const name = ctx.toName ? ` ${ctx.toName.split(/\s+/)[0]}` : ''
  return [
    `<p>Hi${name},</p>`,
    `<p>Your message has been received and is waiting for review by our team.</p>`
  ].join('\n')
}

export async function inboxSendCourtesy(
  kind: 'auto_ack' | 'held_sender',
  ctx: InboxCourtesyContext
): Promise<void> {
  const bodyHtml = kind === 'auto_ack' ? ackBodyHtml(ctx) : heldBodyHtml(ctx)
  const subject = ctx.subject ? `Re: ${ctx.subject}` : `We received your message`
  const result = await inboxSendEmail({
    from: inboxBuildFromAddress({ displayName: ctx.appName, contactAddress: ctx.contactAddress }),
    to: ctx.toEmail,
    subject,
    html: inboxRenderMessageEmail({ bodyHtml, subject }),
    replyTo: inboxBuildReplyAddress(ctx.replyToken, ctx.contactAddress),
    autoReply: true
  })
  if (!result.success) {
    console.warn(`[inbox] ${kind} courtesy send to ${ctx.toEmail} failed: ${result.error}`)
  }
}
