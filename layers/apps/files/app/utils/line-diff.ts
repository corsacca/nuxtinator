// Minimal line-level diff (LCS) for the version-history compare view. No
// dependency — computes the longest common subsequence of lines between two
// markdown snapshots and emits a row list the UI renders with +/-/space gutters.

export type DiffOp = { type: 'same' | 'add' | 'remove', text: string }

export function lineDiff(before: string, after: string): DiffOp[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const n = a.length
  const m = b.length

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j]
        ? lcs[i + 1]![j + 1]! + 1
        : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }

  // Walk the table to build the op list.
  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'same', text: a[i]! })
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ type: 'remove', text: a[i]! })
      i++
    } else {
      ops.push({ type: 'add', text: b[j]! })
      j++
    }
  }
  while (i < n) ops.push({ type: 'remove', text: a[i++]! })
  while (j < m) ops.push({ type: 'add', text: b[j++]! })
  return ops
}
