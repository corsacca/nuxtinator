// Build a Hypothesis-style anchor payload from a DOM Selection within a
// rendered markdown element, given the underlying body_md source.
//
// The anchor stores offsets in body_md space — we find the selected text
// inside body_md (using prefix/suffix from the surrounding rendered text to
// disambiguate identical phrases) and capture the position. Phase 6's
// re-anchor logic operates on the same body_md domain.

import { flexibleMatches } from './text-match'

const PREFIX_LEN = 32
const SUFFIX_LEN = 32

export interface AnchorPayload {
  quote: string
  prefix: string
  suffix: string
  start: number
  end: number
}

export function buildAnchorFromSelection(
  selection: Selection,
  rendererEl: HTMLElement,
  bodyMd: string
): AnchorPayload | null {
  const quote = selection.toString()
  if (!quote || quote.trim().length === 0) return null

  // Confirm selection is inside the renderer.
  const range = selection.getRangeAt(0)
  if (!rendererEl.contains(range.commonAncestorContainer)) return null

  // Plain-text context from the rendered element.
  const fullText = rendererEl.innerText
  const renderedIdx = findRenderedIndex(rendererEl, range)
  if (renderedIdx < 0) {
    // Fall back to plain substring search.
    const fallback = fullText.indexOf(quote)
    return locateInSource(quote, bodyMd, fallback >= 0 ? fullText.slice(Math.max(0, fallback - PREFIX_LEN), fallback) : '')
  }

  const renderedPrefix = fullText.slice(Math.max(0, renderedIdx - PREFIX_LEN), renderedIdx)
  return locateInSource(quote, bodyMd, renderedPrefix)
}

// Try to locate the `quote` in body_md. The rendered text and body_md often
// differ in whitespace (paragraph breaks render as a single newline in
// .innerText / Selection.toString() but are `\n\n` in markdown source), and
// list markers / heading markers don't appear in the rendered text. We do a
// whitespace-flexible match: each run of whitespace in the quote matches
// `\s+` in the source.
function locateInSource(quote: string, bodyMd: string, renderedPrefix: string): AnchorPayload | null {
  const matches = flexibleMatches(bodyMd, quote)
  if (matches.length === 0) return null

  let best = matches[0]!
  if (matches.length > 1 && renderedPrefix) {
    let bestScore = -1
    for (const m of matches) {
      const candidatePrefix = bodyMd.slice(Math.max(0, m.start - PREFIX_LEN), m.start)
      const score = commonSuffix(stripMarkdownNoise(candidatePrefix), renderedPrefix)
      if (score > bestScore) {
        bestScore = score
        best = m
      }
    }
  }

  return {
    quote,
    prefix: bodyMd.slice(Math.max(0, best.start - PREFIX_LEN), best.start),
    suffix: bodyMd.slice(best.end, best.end + SUFFIX_LEN),
    start: best.start,
    end: best.end
  }
}


function findRenderedIndex(root: HTMLElement, range: Range): number {
  // Compute the index of the range start within innerText by walking text nodes.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let pos = 0
  let n: Node | null = walker.nextNode()
  while (n) {
    if (n === range.startContainer) {
      return pos + range.startOffset
    }
    pos += (n.nodeValue ?? '').length
    n = walker.nextNode()
  }
  return -1
}

function stripMarkdownNoise(s: string): string {
  return s.replace(/[*_`#>[\]()-]/g, '')
}

function commonSuffix(a: string, b: string): number {
  let n = 0
  const min = Math.min(a.length, b.length)
  while (n < min && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}
