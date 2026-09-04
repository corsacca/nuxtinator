// Pure helpers: snippets, cid rewriting, structure inspection, sanitising.
import { describe, it, expect } from 'vitest'
import { gmailMakeSnippet, gmailRewriteCidUrls, gmailHtmlToText } from '../../server/utils/gmail-mime'
import { gmailInspectStructure } from '../../server/utils/gmail-transport-imap'
import { gmailSanitizeHtml, gmailSanitizeOutboundHtml } from '../../server/utils/gmail-sanitize'

describe('gmailMakeSnippet', () => {
  it('drops quoted history and collapses whitespace', () => {
    const text = 'Sounds good,\n  see you then.\n\nOn Mon, Jan 5, 2026 at 9:00 AM Jane <jane@x.com> wrote:\n> old stuff\n> more'
    expect(gmailMakeSnippet(text)).toBe('Sounds good, see you then.')
  })

  it('falls back to html and truncates at 200 chars', () => {
    expect(gmailMakeSnippet(null, '<p>Hello <b>world</b></p>')).toBe('Hello world')
    const long = 'x'.repeat(300)
    expect(gmailMakeSnippet(long)!.length).toBe(200)
    expect(gmailMakeSnippet('   ', '')).toBeNull()
  })
})

describe('gmailRewriteCidUrls', () => {
  it('points cid images at the attachment proxy', () => {
    const html = '<img src="cid:logo@x"><img src=\'cid:missing\'>'
    const out = gmailRewriteCidUrls(html, 'msg-1', [{ index: 2, filename: 'logo.png', contentType: 'image/png', size: 1, cid: '<logo@x>', inline: true }])
    expect(out).toBe('<img src="/api/gmail/messages/msg-1/attachments/2"><img src=\'cid:missing\'>')
  })
})

describe('gmailInspectStructure', () => {
  it('finds text parts and attachments in a multipart tree', () => {
    const res = gmailInspectStructure({
      type: 'multipart/mixed',
      childNodes: [
        { type: 'multipart/alternative', childNodes: [{ part: '1.1', type: 'text/plain' }, { part: '1.2', type: 'text/html' }] },
        { part: '2', type: 'application/pdf', disposition: 'attachment', dispositionParameters: { filename: 'a.pdf' } }
      ]
    })
    expect(res).toEqual({ textPart: '1.1', htmlPart: '1.2', hasAttachments: true })
  })

  it('addresses a single-part body as part 1', () => {
    expect(gmailInspectStructure({ type: 'text/plain' })).toEqual({ textPart: '1', htmlPart: null, hasAttachments: false })
  })
})

describe('sanitising', () => {
  it('keeps layout markup and drops active content for display', () => {
    const out = gmailSanitizeHtml('<style>p{color:red}</style><table bgcolor="#fff"><tr><td style="padding:2px">x</td></tr></table><script>1</script><a href="http://a">a</a><img src="/api/gmail/messages/1/attachments/0">')
    expect(out).toContain('<style>p{color:red}</style>')
    expect(out).toContain('bgcolor="#fff"')
    expect(out).not.toContain('<script')
    expect(out).toContain('rel="noopener noreferrer"')
    expect(out).toContain('src="/api/gmail/messages/1/attachments/0"')
  })

  it('strips styles blocks from outbound html', () => {
    expect(gmailSanitizeOutboundHtml('<style>x</style><p onclick="x()">hi</p>')).toBe('<p>hi</p>')
  })

  it('html to text separates blocks', () => {
    expect(gmailHtmlToText('<p>a</p><p>b</p>').trim()).toBe('a\nb')
  })
})
