// POST /api/inbox/contact — public, server-to-server contact-form intake.
// No session, no CORS: the request is authorized by an API key (X-API-Key or a
// Bearer token) that ALSO identifies which org the submission belongs to. The
// submission becomes a source='contact_form' conversation with the message as
// its first inbound message; staff are notified and an auto-ack is sent. The
// submission is never lost to a notification/courtesy failure — those are
// best-effort and swallowed.
import { z } from 'zod'
import { claimChannel, grantConsent } from '#crm/server'

const Body = z.object({
  email: z.string().email(),
  name: z.string().max(300).optional(),
  subject: z.string().max(500).optional(),
  message: z.string().min(1).max(500_000),
  // An explicit marketing-consent checkbox on the form. Only `true` grants;
  // absent/false records nothing (consent is never inferred from submitting).
  consent: z.boolean().optional(),
  // ISO 3166-1 alpha-2 or alpha-3; normalized to alpha-2. Anything unknown or
  // malformed becomes null — a bad country never rejects the submission.
  country: z.string().max(64).optional()
})

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default defineEventHandler(async (event) => {
  const key = getHeader(event, 'x-api-key')
    || (getHeader(event, 'authorization')?.replace(/^Bearer\s+/i, '') ?? '')
  const scope = key ? await inboxResolveOrgForApiKey(key) : undefined
  if (scope === undefined) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid API key' })
  }

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid submission', data: parsed.error.flatten() })
  }
  const { email, name, message } = parsed.data
  const firstLine = message.split('\n').map(l => l.trim()).find(Boolean) ?? ''
  const subject = parsed.data.subject?.trim() || firstLine.slice(0, 120) || 'Contact form message'
  const html = inboxSanitizeEmailHtml(`<p>${message.split('\n').map(escapeHtml).join('<br>')}</p>`)
  const country = inboxNormalizeCountry(parsed.data.country)
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? null
  const userAgent = getHeader(event, 'user-agent') ?? null

  const created = await inboxWithScopeTx(scope, async (tx) => {
    const channel = await claimChannel(tx, { channelType: 'email', value: email })
    // Explicit consent checkbox → a marketing opt-in on the channel, through
    // the CRM consent kernel (compliance log with the submission's origin as
    // evidence; no session, so the actor is null).
    if (parsed.data.consent === true) {
      await grantConsent(tx, { userId: null }, {
        channelId: channel.id,
        purpose: 'marketing',
        source: 'contact_form',
        captureMeta: country ? { country } : {},
        ip,
        userAgent
      })
    }
    const conversation = await inboxCreateConversation(tx, {
      channelId: channel.id,
      subject,
      status: 'open',
      source: 'contact_form',
      counterpartyName: name ?? null
    })
    // Log the origin BEFORE the first message insert, so a failed message write
    // still leaves an explainable shell. The normalized country rides the
    // origin log (channels have no country column).
    await inboxLogConversationEvent(tx, conversation.id, 'inbox_conversation_created', 'Conversation opened', {
      extra: { source: 'contact_form', recipient: email, ...(country ? { country } : {}) }
    })
    const msg = await inboxCreateMessage(tx, {
      conversationId: conversation.id,
      direction: 'inbound',
      status: 'received',
      fromEmail: email,
      fromName: name ?? null,
      subject,
      bodyHtml: html,
      bodyText: message
    })
    await inboxTouchLastMessage(tx, conversation.id, msg.created_at, 'inbound', { counterpartyName: name ?? null })
    await inboxLogConversationEvent(tx, conversation.id, 'inbox_inbound_received', 'Inbound email (contact)', {
      extra: { outcome: 'contact', source: 'contact_form' }
    })

    const settings = await getInboxSettings(tx)
    return {
      conversationId: conversation.id,
      replyToken: conversation.reply_token,
      contactAddress: settings.contactAddress,
      brandFromName: settings.brandFromName,
      autoAck: settings.autoAckEnabled
    }
  })

  // Post-commit staff notification — best-effort, in its OWN transaction. It
  // must not share the persistence transaction: a notify failure there would
  // abort the tx, turning COMMIT into a silent ROLLBACK and losing the
  // submission while the visitor still sees success.
  await inboxWithScopeTx(scope, async (tx) => {
    // Test seam (VITEST only): fail the notify so the suite can pin that the
    // stored submission survives a notification failure.
    if (process.env.VITEST && getHeader(event, 'x-test-fail') === 'notify') {
      throw new Error('Injected notify failure')
    }
    await inboxNotifyNewMessage(tx, {
      orgId: scope,
      conversationId: created.conversationId,
      assignedUserId: null,
      counterparty: name || email,
      subject,
      held: false,
      excerpt: message,
      senderAddress: email
    })
  }).catch(err => console.warn('[inbox] contact-form notify failed:', err))

  // Post-commit auto-ack (fire-and-forget — never blocks or fails the POST).
  if (created.autoAck && created.contactAddress) {
    void inboxSendCourtesy('auto_ack', {
      toEmail: email,
      toName: name ?? null,
      subject,
      replyToken: created.replyToken,
      contactAddress: created.contactAddress,
      brandName: created.brandFromName
    }).catch(err => console.warn('[inbox] contact-form auto-ack failed:', err))
  }

  return { status: 'received', conversationId: created.conversationId }
})
