// Word-token regex matcher used by both the selection-time anchor builder
// (anchor.ts) and the display-time DOM range finder (anchor-position.ts).
// Tokenizes the quote into word runs and finds sequences of those tokens in
// the source where each next token is at most MAX_GAP characters past the
// previous — bridges whitespace, paragraph breaks, markdown markers, and
// URLs without false-matching across unrelated content.

export interface FlexMatch {
  start: number
  end: number
}

// Max source characters allowed between consecutive quote tokens.
const MAX_GAP = 500

export function flexibleMatches(source: string, quote: string): FlexMatch[] {
  const tokens = (quote.match(/\w+/gu) ?? [])
  if (tokens.length === 0) {
    // Punctuation-only quote — fall back to a literal-with-flex-whitespace match.
    const trimmed = quote.replace(/^\s+|\s+$/g, '')
    if (!trimmed) return []
    const pattern = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')
    let re: RegExp
    try { re = new RegExp(pattern, 'g') } catch { return [] }
    const out: FlexMatch[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(source)) !== null) {
      out.push({ start: m.index, end: m.index + m[0].length })
      if (re.lastIndex === m.index) re.lastIndex++
    }
    return out
  }

  const tokenPatterns = tokens.map(t =>
    new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
  )

  const out: FlexMatch[] = []
  const firstRe = tokenPatterns[0]!
  firstRe.lastIndex = 0
  let firstMatch: RegExpExecArray | null
  while ((firstMatch = firstRe.exec(source)) !== null) {
    const startIdx = firstMatch.index
    let cursor = startIdx + firstMatch[0].length
    let endIdx = cursor
    let ok = true
    for (let i = 1; i < tokenPatterns.length; i++) {
      const re = tokenPatterns[i]!
      re.lastIndex = cursor
      const m = re.exec(source)
      if (!m || m.index - cursor > MAX_GAP) {
        ok = false
        break
      }
      cursor = m.index + m[0].length
      endIdx = cursor
    }
    if (ok) out.push({ start: startIdx, end: endIdx })
    if (firstRe.lastIndex === firstMatch.index) firstRe.lastIndex++
  }
  return out
}
