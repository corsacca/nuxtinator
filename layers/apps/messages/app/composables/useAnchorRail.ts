// Drives the comments rail in ItemModal: keeps each anchored bubble's y-coord
// in sync with its anchor's first line in the rendered doc, then stacks all
// bubbles (floating + anchored + pending composer) so they don't overlap.
// Re-runs on:
//   - Vue reactivity changes to the inputs (computed lists, pending anchor)
//   - ResizeObserver firing on the doc OR any bubble (e.g. reply expansion)
//   - An explicit `recompute()` call
//
// Returns reactive `positions` (id → y px) and `pendingY` for the composer
// bubble. The caller owns the rail's <aside> and renders bubbles at those y
// values via `position: absolute; top: <y>px`.

import type { AnchorPayload } from '../utils/anchor'
import { findAnchorRect, applyAnchorHighlights } from '../utils/anchor-position'

interface BubbleLike {
  id: string
  anchor: AnchorPayload | null
}

const BUBBLE_GAP = 12

export interface UseAnchorRailOpts {
  rendererRef: Ref<{ getRootEl: () => HTMLElement | null } | null>
  docContentRef: Ref<HTMLElement | null>
  railRef: Ref<HTMLElement | null>
  anchoredComments: Ref<BubbleLike[]> | ComputedRef<BubbleLike[]>
  floatingComments: Ref<BubbleLike[]> | ComputedRef<BubbleLike[]>
  pendingAnchor: Ref<AnchorPayload | null>
}

export function useAnchorRail(opts: UseAnchorRailOpts) {
  const positions = ref<Map<string, number>>(new Map())
  const pendingY = ref<number | null>(null)

  let ro: ResizeObserver | null = null

  function recompute() {
    const root = opts.rendererRef.value?.getRootEl()
    const docEl = opts.docContentRef.value
    if (!root || !docEl) return

    // Visual highlight on each anchored span in the rendered doc.
    applyAnchorHighlights(
      root,
      opts.anchoredComments.value
        .filter((c): c is BubbleLike & { anchor: AnchorPayload } => !!c.anchor)
        .map(c => ({ id: c.id, anchor: c.anchor }))
    )

    const docTop = docEl.getBoundingClientRect().top
    const baseEntries: Array<{ id: string, y: number }> = []
    // Floating (orphans + unanchored) sit at the top.
    for (const c of opts.floatingComments.value) {
      baseEntries.push({ id: c.id, y: 0 })
    }
    // Anchored: locate each in the rendered DOM. If not found (anchor's quote
    // doesn't exist in current body_md), fall back to y=0 so it still stacks
    // with the floating ones instead of piling at top.
    for (const c of opts.anchoredComments.value) {
      if (!c.anchor) continue
      const rect = findAnchorRect(root, c.anchor)
      baseEntries.push({ id: c.id, y: rect ? Math.max(0, rect.top - docTop) : 0 })
    }

    // Pending-composer anchor's y.
    let pY: number | null = null
    if (opts.pendingAnchor.value) {
      const rect = findAnchorRect(root, opts.pendingAnchor.value)
      pY = rect ? Math.max(0, rect.top - docTop) : 0
    }

    // Initial pass at base y so bubbles render and we can measure their heights.
    const initial = new Map<string, number>()
    for (const e of baseEntries) initial.set(e.id, e.y)
    positions.value = initial
    pendingY.value = pY

    nextTick(() => stack(baseEntries, pY))
    // Re-stack after a brief delay to absorb modal-animation / font-load shifts.
    setTimeout(() => stack(baseEntries, pY), 250)
  }

  function stack(
    baseEntries: Array<{ id: string, y: number }>,
    basePendingY: number | null
  ) {
    const rail = opts.railRef.value
    if (!rail) return

    const heights = new Map<string, number>()
    rail.querySelectorAll<HTMLElement>('[data-bubble-id]').forEach((el) => {
      heights.set(el.dataset.bubbleId!, el.offsetHeight)
      // Observe each bubble so reply/edit expansions retrigger stacking.
      ro?.observe(el)
    })

    type Entry = { id: string, y: number }
    const all: Entry[] = baseEntries.slice()
    if (basePendingY != null) all.push({ id: 'pending', y: basePendingY })
    all.sort((a, b) => a.y - b.y)

    let lastBottom = -BUBBLE_GAP
    const stacked = new Map<string, number>()
    for (const e of all) {
      const y = Math.max(e.y, lastBottom + BUBBLE_GAP)
      stacked.set(e.id, y)
      lastBottom = y + (heights.get(e.id) ?? 100)
    }

    const next = new Map<string, number>()
    for (const e of baseEntries) {
      const y = stacked.get(e.id)
      if (y != null) next.set(e.id, y)
    }
    positions.value = next
    if (basePendingY != null) {
      pendingY.value = stacked.get('pending') ?? basePendingY
    }
  }

  // Lifecycle: observe doc content + each bubble for size changes; trigger
  // recompute on relevant reactive changes.
  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => recompute())
      if (opts.docContentRef.value) ro.observe(opts.docContentRef.value)
    }
  })
  onBeforeUnmount(() => {
    ro?.disconnect()
  })

  watch(
    [opts.anchoredComments, opts.floatingComments, opts.pendingAnchor],
    () => nextTick(recompute),
    { deep: false }
  )

  return { positions, pendingY, recompute }
}
