// Allowlist sanitizer for mail HTML. Bodies render inside a sandboxed frame
// with scripts disabled, so the goal is to strip active content while
// keeping the table-and-inline-style layout real email depends on.
import sanitizeHtml from 'sanitize-html'

const LAYOUT_ATTRS = ['style', 'class', 'id', 'align', 'valign', 'width', 'height', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'dir', 'lang', 'color', 'face', 'size', 'title']

export function gmailSanitizeHtml(html: string | null | undefined): string {
  if (!html) return ''
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'style', 'center', 'font', 'u', 's', 'span', 'div', 'html', 'head', 'body']),
    // <style> blocks are inert without scripts and carry newsletter layouts.
    allowVulnerableTags: true,
    allowedAttributes: {
      '*': LAYOUT_ATTRS,
      'a': [...LAYOUT_ATTRS, 'href', 'name', 'target', 'rel'],
      'img': [...LAYOUT_ATTRS, 'src', 'alt'],
      'td': [...LAYOUT_ATTRS, 'colspan', 'rowspan', 'background'],
      'th': [...LAYOUT_ATTRS, 'colspan', 'rowspan'],
      'table': [...LAYOUT_ATTRS, 'background']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'], td: ['http', 'https'], table: ['http', 'https'] },
    allowedSchemesAppliedToAttributes: ['href', 'src', 'background'],
    // Relative URLs are the rewritten inline-image proxy paths.
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }, true)
    }
  })
}

// Composer output going out as email: formatting only, no styles blocks.
export function gmailSanitizeOutboundHtml(html: string | null | undefined): string {
  if (!html) return ''
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'u', 's', 'span', 'div']),
    allowedAttributes: {
      '*': ['style'],
      'a': ['href', 'name', 'target', 'rel'],
      'img': ['src', 'alt', 'width', 'height', 'style']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'cid'],
    allowedSchemesByTag: { img: ['http', 'https', 'cid', 'data'] }
  })
}
