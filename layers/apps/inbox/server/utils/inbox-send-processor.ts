// The outbound send sweep body. A queued inbox_messages row is the send job;
// per org scope the sweep claims each due row (atomic queued→sent) inside a
// short transaction, builds and sends the email OUTSIDE any transaction
// (provider latency must not hold a DB connection), then records the result.
// A confirmed provider failure releases the claim with backoff; a crash
// mid-send leaves the row 'sent' without a provider id — at-most-once, the
// same bias the inbound pipeline has.
import type { Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import { isSuppressed } from '#crm/server'
import type { InboxMessageRow } from './inbox-messages'
import type { InboxQuoteCandidate } from './inbox-quote'

type Tx = Transaction<Database>

interface PreparedSend {
  claimed: InboxMessageRow
  toEmail: string
  fromAddress: string
  replyTo: string
  subject: string
  html: string
  text: string | undefined
  inReplyTo: string | undefined
}

async function prepareSend(tx: Tx, msg: InboxMessageRow): Promise<PreparedSend | null> {
  const conversation = await inboxGetConversation(tx, msg.conversation_id)
  if (!conversation) {
    await inboxMarkMessageFailed(tx, msg.id, 'Conversation missing')
    return null
  }
  const channel = await tx
    .selectFrom('crm_channels')
    .select(['id', 'value'])
    .where('id', '=', conversation.channel_id)
    .executeTakeFirst()
  const toEmail = msg.to_email || channel?.value || null
  if (!toEmail) {
    await inboxMarkMessageFailed(tx, msg.id, 'No recipient')
    return null
  }
  // Deliverability gate only — deliberately NOT canSend(): consent must not
  // block 1:1 conversational replies; a bounce stops sends, a marketing
  // unsubscribe doesn't.
  if (channel && await isSuppressed(tx, channel.id)) {
    await inboxMarkMessageFailed(tx, msg.id, 'Recipient suppressed')
    return null
  }

  const claimed = await inboxClaimForSend(tx, msg.id)
  if (!claimed) return null // another worker won

  const settings = await getInboxSettings(tx)
  if (!settings.contactAddress) {
    // Without a From identity nothing can send — release so it retries once
    // the org is configured.
    await inboxReleaseForRetry(tx, claimed, 'Inbox contact address not configured')
    return null
  }

  const senderName = claimed.sender_user_id
    ? (await tx.selectFrom('users').select('display_name').where('id', '=', claimed.sender_user_id).executeTakeFirst())?.display_name ?? null
    : null

  // Quoted history: everything before this reply, excluding drafts (not in
  // the list) and held messages (never leak a held sender's content, never
  // anchor on it).
  const prior = (await inboxListMessages(tx, conversation.id))
    .filter(m => m.id !== claimed.id && m.status !== 'held')
  const quoteCandidates: InboxQuoteCandidate[] = prior.map(m => ({
    direction: m.direction,
    from_name: m.direction === 'outbound' ? (m.sender_name ?? m.from_name) : m.from_name,
    from_email: m.from_email,
    body_html: m.body_html,
    body_stripped_html: m.body_stripped_html,
    body_text: m.body_text,
    created_at: m.created_at
  }))
  const fallbackName = senderName || 'Team'

  const lastInbound = await inboxGetLastInbound(tx, conversation.id)

  const bodyHtml = (claimed.body_html || '') + inboxBuildQuotedHtml(quoteCandidates, fallbackName)
  const bodyText = (claimed.body_text || '') + inboxBuildQuotedText(quoteCandidates, fallbackName)
  const subject = claimed.subject || (conversation.subject ? `Re: ${conversation.subject.replace(/^Re:\s*/i, '')}` : 'Re:')

  return {
    claimed,
    toEmail,
    fromAddress: inboxBuildFromAddress({ displayName: senderName, contactAddress: settings.contactAddress }),
    replyTo: inboxBuildReplyAddress(conversation.reply_token, settings.contactAddress),
    subject,
    html: inboxRenderMessageEmail({ bodyHtml: inboxConstrainImages(bodyHtml), subject }),
    text: bodyText || undefined,
    inReplyTo: lastInbound?.email_message_id ?? undefined
  }
}

export async function inboxRunSendSweep(): Promise<void> {
  for (const orgId of await inboxListOrgScopes()) {
    const due = await inboxWithScopeTx(orgId, tx => inboxListDueQueued(tx))
    for (const msg of due) {
      let prep: PreparedSend | null = null
      try {
        prep = await inboxWithScopeTx(orgId, tx => prepareSend(tx, msg))
      } catch (err) {
        console.error('[inbox] send prepare failed:', err instanceof Error ? err.message : err)
        continue
      }
      if (!prep) continue

      const result = await inboxSendEmail({
        from: prep.fromAddress,
        to: prep.toEmail,
        subject: prep.subject,
        html: prep.html,
        text: prep.text,
        replyTo: prep.replyTo,
        inReplyTo: prep.inReplyTo,
        references: prep.inReplyTo,
        userVariables: {
          ...(orgId ? { 'inbox-org': orgId } : {}),
          'inbox-msg': prep.claimed.id
        }
      })

      await inboxWithScopeTx(orgId, async (tx) => {
        if (result.success) {
          await inboxMarkSent(tx, prep.claimed.id, result.providerMessageId)
        } else {
          await inboxReleaseForRetry(tx, prep.claimed, result.error || 'Send failed')
        }
      })
    }
  }
}
