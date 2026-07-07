// Allowlist sanitizer for untrusted HTML (inbound email bodies) that gets
// embedded into OUTBOUND email we send: quoted history and staff reply
// bodies. The browser thread view sanitizes separately (DOMPurify) before
// `v-html`; this guards the email sinks, which never pass through the
// browser. Keeps common formatting; drops scripts, event handlers, and
// dangerous URL schemes.
import sanitizeHtml from 'sanitize-html'

export function inboxSanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return ''
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'width', 'height', 'style'],
      a: ['href', 'name', 'target', 'rel'],
      '*': ['style']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'cid'],
    allowedSchemesByTag: { img: ['http', 'https', 'cid', 'data'] },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true)
    }
  })
}
