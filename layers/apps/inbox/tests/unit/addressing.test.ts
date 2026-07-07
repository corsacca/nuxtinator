// Pure-function coverage for the addressing grammar and the inbound parsing
// helpers (auth verdicts, auto-responder detection).
import { describe, it, expect } from 'vitest'
import {
  inboxParseRecipient,
  inboxIsBounceRecipient,
  inboxBuildReplyAddress,
  inboxBuildFromAddress
} from '../../server/utils/inbox-addressing'
import {
  inboxParseMessageHeaders,
  inboxExtractEmailAddress,
  inboxExtractDisplayName,
  inboxParseAuthentication,
  inboxIsAutoResponderOrBounce,
  inboxIsVacationAutoReply
} from '../../server/utils/inbox-inbound-parse'

describe('inbox addressing', () => {
  it('parses plain, token, and future signed-shape recipients', () => {
    expect(inboxParseRecipient('contact@x.test')).toMatchObject({ base: 'contact', token: null, domain: 'x.test' })
    expect(inboxParseRecipient('contact+ab12@x.test')).toMatchObject({ base: 'contact', token: 'ab12' })
    // Signed staff addresses (token.exp.sig) parse today; only the token is used.
    expect(inboxParseRecipient('contact+ab12.k3.f00d@x.test')).toMatchObject({ token: 'ab12' })
    expect(inboxParseRecipient('"Someone" <Contact+AB12@X.TEST>')).toMatchObject({ token: 'ab12', domain: 'x.test' })
    expect(inboxParseRecipient('not-an-email')).toBeNull()
  })

  it('flags the VERP bounce return-path', () => {
    expect(inboxIsBounceRecipient(inboxParseRecipient('bounce@x.test'))).toBe(true)
    expect(inboxIsBounceRecipient(inboxParseRecipient('bounce+verp@x.test'))).toBe(true)
    expect(inboxIsBounceRecipient(inboxParseRecipient('contact@x.test'))).toBe(false)
  })

  it('builds reply and From addresses', () => {
    expect(inboxBuildReplyAddress('tok', 'contact@x.test')).toBe('contact+tok@x.test')
    expect(inboxBuildFromAddress({ displayName: 'Jane', contactAddress: 'contact@x.test' }))
      .toBe('"Jane" <contact@x.test>')
    expect(inboxBuildFromAddress({ contactAddress: 'contact@x.test' })).toBe('contact@x.test')
  })
})

describe('inbound parsing', () => {
  it('extracts addresses and display names', () => {
    expect(inboxExtractEmailAddress('Jane Doe <JANE@X.TEST>')).toBe('jane@x.test')
    expect(inboxExtractDisplayName('"Jane Doe" <jane@x.test>')).toBe('Jane Doe')
    expect(inboxExtractDisplayName('jane@x.test')).toBeNull()
  })

  it('authenticates on dmarc pass or aligned dkim, never on misaligned dkim', () => {
    const h = (ar: string) => inboxParseMessageHeaders(JSON.stringify([['Authentication-Results', ar]]))
    expect(inboxParseAuthentication(h('mx; dmarc=pass'), 'a@gmail.com').authenticated).toBe(true)
    expect(inboxParseAuthentication(h('mx; dkim=pass header.d=gmail.com'), 'a@gmail.com').authenticated).toBe(true)
    expect(inboxParseAuthentication(h('mx; dkim=pass header.d=evil.example'), 'a@gmail.com').authenticated).toBe(false)
    expect(inboxParseAuthentication(h('mx; dkim=fail; dmarc=fail'), 'a@gmail.com').authenticated).toBe(false)
    expect(inboxParseAuthentication(inboxParseMessageHeaders('[]'), 'a@gmail.com').authenticated).toBe(false)
  })

  it('detects auto-responders and the vacation subset', () => {
    const auto = inboxParseMessageHeaders(JSON.stringify([['Auto-Submitted', 'auto-replied']]))
    const bounce = inboxParseMessageHeaders(JSON.stringify([['Auto-Submitted', 'auto-generated']]))
    const human = inboxParseMessageHeaders('[]')

    expect(inboxIsAutoResponderOrBounce(auto, 'a@x.test')).toBe(true)
    expect(inboxIsVacationAutoReply(auto, 'a@x.test')).toBe(true)
    // DSN/bounce style is an auto-responder but NOT a vacation reply.
    expect(inboxIsAutoResponderOrBounce(bounce, 'a@x.test')).toBe(true)
    expect(inboxIsVacationAutoReply(bounce, 'a@x.test')).toBe(false)
    expect(inboxIsAutoResponderOrBounce(human, 'mailer-daemon@x.test')).toBe(true)
    expect(inboxIsVacationAutoReply(human, 'mailer-daemon@x.test')).toBe(false)
    expect(inboxIsAutoResponderOrBounce(human, 'a@x.test')).toBe(false)
  })
})
