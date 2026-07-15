// text/plain derivation from HTML bodies: block boundaries must become
// newlines before tags are stripped, so adjacent blocks never jam into one
// word in outbound text parts, quoted history, or transport fallbacks.
import { describe, it, expect } from 'vitest'
import { inboxHtmlToText } from '../../server/utils/inbox-sanitize'
import { inboxBuildQuotedText } from '../../server/utils/inbox-quote'

describe('inboxHtmlToText', () => {
  it('separates adjacent block elements with newlines', () => {
    expect(inboxHtmlToText('<p>alpha</p><p>beta</p>')).toBe('alpha\nbeta\n')
    expect(inboxHtmlToText('<div>one</div><div>two</div>')).toBe('one\ntwo\n')
    expect(inboxHtmlToText('<h1>Title</h1><p>body</p>')).toBe('Title\nbody\n')
  })

  it('converts <br> variants to newlines', () => {
    expect(inboxHtmlToText('a<br>b<br/>c<br />d')).toBe('a\nb\nc\nd')
  })

  it('keeps inline formatting seamless and handles empty input', () => {
    expect(inboxHtmlToText('<p>a <b>bold</b> word</p>')).toBe('a bold word\n')
    expect(inboxHtmlToText('')).toBe('')
    expect(inboxHtmlToText(null)).toBe('')
    expect(inboxHtmlToText(undefined)).toBe('')
  })

  it('feeds readable lines into the quoted-text builder', () => {
    const out = inboxBuildQuotedText([{
      direction: 'inbound',
      from_name: 'Ada',
      from_email: 'ada@example.com',
      body_html: '<p>first line</p><p>second line</p>',
      body_stripped_html: null,
      body_text: null,
      created_at: new Date('2026-01-01T00:00:00Z')
    }], 'Team')
    expect(out).toContain('> first line')
    expect(out).toContain('> second line')
    expect(out).not.toContain('linesecond')
  })
})
