// AI-context message selection: held rows (untrusted senders — a
// prompt-injection channel) never reach the AI features' thread framing.
// Both generateInboxDraft and extractInboxKnowledgeEntry build their thread
// from inboxAiContextMessages(inboxListMessages(...)).
import { describe, it, expect } from 'vitest'
import { inboxAiContextMessages, INBOX_MESSAGE_STATUSES } from '../../server/utils/inbox-messages'

describe('inboxAiContextMessages', () => {
  it('drops held rows and keeps every other status', () => {
    const rows = INBOX_MESSAGE_STATUSES.map(status => ({ status, body: `body-${status}` }))
    const kept = inboxAiContextMessages(rows)
    expect(kept.map(r => r.status)).not.toContain('held')
    expect(kept.map(r => r.status)).toEqual(INBOX_MESSAGE_STATUSES.filter(s => s !== 'held'))
    // Failed outbound rows are staff-authored and deliberately stay visible.
    expect(kept.map(r => r.status)).toContain('failed')
  })

  it('passes an all-trusted thread through unchanged', () => {
    const rows = [{ status: 'received' }, { status: 'sent' }, { status: 'queued' }]
    expect(inboxAiContextMessages(rows)).toEqual(rows)
  })
})
