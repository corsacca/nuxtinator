// Hypothesis-style multi-strategy re-anchoring for highlight comments.
// Runs after `messages_items.body_md` is edited; updates each non-null
// `messages_comments.anchor` to reflect new offsets, or marks it orphaned
// when no acceptable match exists.

import type { Transaction } from 'kysely'
import type { Database } from '~/server/database/schema'
import type { AnchorPayload } from '../database/schema.d'

const CONTEXT_LEN = 32

export async function rematchAnchors(
  tx: Transaction<Database>,
  itemId: string,
  newBodyMd: string
): Promise<void> {
  const rows = await tx
    .selectFrom('messages_comments')
    .select(['id', 'anchor'])
    .where('item_id', '=', itemId)
    .where('anchor', 'is not', null)
    .where('deleted_at', 'is', null)
    .execute()

  if (rows.length === 0) return

  for (const row of rows) {
    const anchor = row.anchor as AnchorPayload | null
    if (!anchor) continue
    const result = rematchOne(anchor, newBodyMd)
    await tx
      .updateTable('messages_comments')
      .set({
        anchor: result.anchor as unknown as Record<string, unknown>,
        anchor_orphaned: result.orphaned
      })
      .where('id', '=', row.id)
      .execute()
  }
}

interface RematchResult {
  anchor: AnchorPayload
  orphaned: boolean
}

export function rematchOne(anchor: AnchorPayload, body: string): RematchResult {
  const { quote, prefix, suffix } = anchor

  // 1. Exact substring matches
  const positions = findAll(body, quote)
  if (positions.length === 1) {
    return success(anchor, positions[0]!, quote.length, body)
  }

  // 2. Disambiguate by prefix/suffix among multiple exact matches
  if (positions.length > 1) {
    let best: number | null = null
    let bestScore = -1
    for (const pos of positions) {
      const candPrefix = body.slice(Math.max(0, pos - prefix.length), pos)
      const candSuffix = body.slice(pos + quote.length, pos + quote.length + suffix.length)
      const score = commonSuffixLen(candPrefix, prefix) + commonPrefixLen(candSuffix, suffix)
      if (score > bestScore) {
        bestScore = score
        best = pos
      }
    }
    if (best !== null) return success(anchor, best, quote.length, body)
  }

  // 3. Fuzzy match: Levenshtein within ~20% of quote length
  const fuzzy = fuzzyFind(body, quote, prefix, suffix)
  if (fuzzy) {
    return success(anchor, fuzzy.start, fuzzy.length, body)
  }

  // 4. Prefix + suffix region — gap-fill if both still exist
  if (prefix && suffix) {
    const fromPrefix = findClosest(body, prefix)
    if (fromPrefix !== -1) {
      const afterPrefix = fromPrefix + prefix.length
      const sIdx = body.indexOf(suffix, afterPrefix)
      // Only accept if the gap is plausibly the same span (within 3x quote length)
      const maxGap = Math.max(quote.length * 3, quote.length + 50)
      if (sIdx > afterPrefix && sIdx - afterPrefix <= maxGap) {
        return success(anchor, afterPrefix, sIdx - afterPrefix, body)
      }
    }
  }

  // 5. Orphan
  return { anchor, orphaned: true }
}

function success(anchor: AnchorPayload, start: number, length: number, body: string): RematchResult {
  return {
    anchor: {
      quote: anchor.quote, // preserve the original quote text for display
      start,
      end: start + length,
      prefix: body.slice(Math.max(0, start - CONTEXT_LEN), start),
      suffix: body.slice(start + length, start + length + CONTEXT_LEN)
    },
    orphaned: false
  }
}

function findAll(haystack: string, needle: string): number[] {
  if (!needle) return []
  const out: number[] = []
  let from = 0
  while (true) {
    const i = haystack.indexOf(needle, from)
    if (i === -1) break
    out.push(i)
    from = i + 1
  }
  return out
}

function findClosest(haystack: string, needle: string): number {
  // Last occurrence is usually closest in practice; fine for our scale.
  return haystack.lastIndexOf(needle)
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

// Fuzzy substring search: slide a window of |quote|+/-tolerance over body and
// return the first window whose Levenshtein distance to quote is <= tolerance.
// Uses a context-narrowed search if prefix/suffix anchors exist to avoid
// scanning the whole body.
function fuzzyFind(
  body: string,
  quote: string,
  prefix: string,
  suffix: string
): { start: number, length: number } | null {
  if (quote.length === 0) return null
  const tolerance = Math.max(2, Math.floor(quote.length * 0.2))

  const ranges = candidateRanges(body, quote.length, prefix, suffix)
  for (const [lo, hi] of ranges) {
    // Try a few candidate lengths around |quote|.
    for (let len = Math.max(1, quote.length - tolerance); len <= quote.length + tolerance; len++) {
      const lastStart = Math.min(hi, body.length - len)
      for (let s = lo; s <= lastStart; s++) {
        const window = body.slice(s, s + len)
        if (levenshtein(window, quote, tolerance) <= tolerance) {
          return { start: s, length: len }
        }
      }
    }
  }
  return null
}

// Build candidate (lo, hi) ranges where lo is a possible match start. If we
// have prefix/suffix context, restrict to small windows around their hits.
function candidateRanges(
  body: string,
  quoteLen: number,
  prefix: string,
  suffix: string
): Array<[number, number]> {
  const slack = Math.max(quoteLen, 80)
  const ranges: Array<[number, number]> = []

  if (prefix) {
    let from = 0
    while (true) {
      const i = body.indexOf(prefix, from)
      if (i === -1) break
      const start = i + prefix.length
      ranges.push([Math.max(0, start - 4), Math.min(body.length, start + slack)])
      from = i + 1
    }
  }
  if (suffix) {
    let from = 0
    while (true) {
      const i = body.indexOf(suffix, from)
      if (i === -1) break
      ranges.push([Math.max(0, i - slack), Math.max(0, i)])
      from = i + 1
    }
  }
  if (ranges.length === 0) {
    // Last resort: scan whole body. Bounded by 64KB cap.
    ranges.push([0, body.length])
  }
  return ranges
}

// Levenshtein with early-exit if the running min distance exceeds `maxDist`.
function levenshtein(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1
  if (a === b) return 0
  const al = a.length
  const bl = b.length
  if (al === 0) return bl
  if (bl === 0) return al

  let prev = new Array(bl + 1)
  let curr = new Array(bl + 1)
  for (let j = 0; j <= bl; j++) prev[j] = j

  for (let i = 1; i <= al; i++) {
    curr[0] = i
    let rowMin = curr[0]
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        prev[j] + 1,        // deletion
        curr[j - 1] + 1,    // insertion
        prev[j - 1] + cost  // substitution
      )
      if (curr[j] < rowMin) rowMin = curr[j]
    }
    if (rowMin > maxDist) return maxDist + 1
    ;[prev, curr] = [curr, prev]
  }
  return prev[bl]
}
