// Resolve an anchor's DOM rect inside a rendered markdown element. Used to
// position comment bubbles next to their anchor's line in the doc.
//
// Strategy: walk the renderer's text nodes, build a flat plaintext + a map
// back to the original text nodes, find `anchor.quote` (disambiguated by
// prefix/suffix when multiple matches exist), then build a DOM Range to
// retrieve the visual rect.

import { flexibleMatches } from './text-match'

interface AnchorLike {
  quote: string
  prefix?: string
  suffix?: string
}

interface Segment {
  node: Text
  start: number // accumulated offset in the flat plaintext
}

export function findAnchorRect(
  rendererEl: HTMLElement,
  anchor: AnchorLike
): DOMRect | null {
  return findAnchorRange(rendererEl, anchor)?.getBoundingClientRect() ?? null
}

export function findAnchorRange(
  rendererEl: HTMLElement,
  anchor: AnchorLike
): Range | null {
  const segments: Segment[] = []
  let plain = ''
  const walker = document.createTreeWalker(rendererEl, NodeFilter.SHOW_TEXT)
  let n: Node | null = walker.nextNode()
  while (n) {
    const t = n as Text
    segments.push({ node: t, start: plain.length })
    plain += t.nodeValue ?? ''
    n = walker.nextNode()
  }
  if (plain.length === 0) return null

  // Word-token regex match. Bridges block boundaries (where the rendered
  // plaintext has no separator but selection.toString() inserts \n) and
  // markdown markers in the source.
  const matches = flexibleMatches(plain, anchor.quote)
  if (matches.length === 0) return null

  let best = matches[0]!
  if (matches.length > 1 && (anchor.prefix || anchor.suffix)) {
    let bestScore = -1
    for (const m of matches) {
      const cp = plain.slice(Math.max(0, m.start - (anchor.prefix?.length ?? 0)), m.start)
      const cs = plain.slice(m.end, m.end + (anchor.suffix?.length ?? 0))
      const score
        = (anchor.prefix ? commonSuffixLen(cp, anchor.prefix) : 0)
        + (anchor.suffix ? commonPrefixLen(cs, anchor.suffix) : 0)
      if (score > bestScore) {
        bestScore = score
        best = m
      }
    }
  }

  const startSeg = findSegmentAt(segments, best.start)
  const endSeg = findSegmentAt(segments, best.end)
  if (!startSeg || !endSeg) return null
  const range = document.createRange()
  try {
    range.setStart(startSeg.node, best.start - startSeg.start)
    range.setEnd(endSeg.node, Math.min(endSeg.node.length, best.end - endSeg.start))
  } catch {
    return null
  }
  return range
}

// Wrap each anchor's range in a <span class="anchor-highlight" data-comment-id=...>.
// First removes any existing highlights so multiple calls are idempotent.
export function applyAnchorHighlights(
  rendererEl: HTMLElement,
  items: Array<{ id: string, anchor: AnchorLike }>
): void {
  // Unwrap previous
  rendererEl.querySelectorAll('span.anchor-highlight').forEach((el) => {
    const parent = el.parentNode
    if (!parent) return
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
  })
  // Merge any text nodes that were split during previous wrapping.
  rendererEl.normalize()

  for (const { id, anchor } of items) {
    const range = findAnchorRange(rendererEl, anchor)
    if (!range) continue
    const span = document.createElement('span')
    span.className = 'anchor-highlight'
    span.dataset.commentId = id
    try {
      range.surroundContents(span)
    } catch {
      try {
        const frag = range.extractContents()
        span.appendChild(frag)
        range.insertNode(span)
      } catch {
        // Range spans complex DOM; skip rather than corrupt the tree.
      }
    }
  }
}


function findSegmentAt(segments: Segment[], offset: number): Segment | null {
  // Last segment whose start <= offset.
  let lo = 0
  let hi = segments.length - 1
  let result: Segment | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (segments[mid]!.start <= offset) {
      result = segments[mid]!
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return result
}

function commonPrefixLen(a: string, b: string): number {
  let n = 0
  const m = Math.min(a.length, b.length)
  while (n < m && a[n] === b[n]) n++
  return n
}

function commonSuffixLen(a: string, b: string): number {
  let n = 0
  const m = Math.min(a.length, b.length)
  while (n < m && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}
