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

// Internal-note bodies: staff-authored rich HTML rendered only in the browser
// (never an email sink). Email formatting minus images, plus the Tiptap
// mention span (data-type / data-id / data-label) so @mentions survive the
// round trip — the server extracts notification recipients from THIS
// sanitized markup, never from a client-supplied id list.
export function inboxSanitizeNoteHtml(html: string | null | undefined): string {
  if (!html) return ''
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'name', 'target', 'rel'],
      span: ['data-type', 'data-id', 'data-label', 'class']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true)
    }
  })
}

const MENTION_SPAN_RE = /<span\b[^>]*\bdata-type="mention"[^>]*>/gi
const MENTION_ID_RE = /\bdata-id="([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/i

// User ids @mentioned in a sanitized note body, deduped. Only well-formed
// uuids in mention spans count — anything else is markup noise, not a
// recipient.
export function inboxExtractMentionIds(sanitizedHtml: string): string[] {
  const ids = new Set<string>()
  for (const tag of sanitizedHtml.match(MENTION_SPAN_RE) ?? []) {
    const m = MENTION_ID_RE.exec(tag)
    if (m?.[1]) ids.add(m[1].toLowerCase())
  }
  return [...ids]
}
