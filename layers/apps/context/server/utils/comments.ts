// Comment anchoring helpers. The client posts an anchor as a (start, end)
// offset pair plus the exact quoted text and a sha256 of that quote. On read,
// we recompute `content.slice(start, end) === quoted_text` to surface a
// stale anchor (the section content was edited and the anchor no longer
// points at the same characters).

import crypto from 'node:crypto'

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex')
}

export function isAnchorStale(
  sectionContent: string,
  anchorStart: number,
  anchorEnd: number,
  quotedText: string
): boolean {
  if (anchorStart < 0 || anchorEnd > sectionContent.length || anchorStart > anchorEnd) {
    return true
  }
  return sectionContent.slice(anchorStart, anchorEnd) !== quotedText
}
