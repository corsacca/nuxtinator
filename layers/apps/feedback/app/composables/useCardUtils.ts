import type { KanbanCardModel, PostType } from '../components/kanban/types'

/**
 * Cards in the DOING column carry a workflow phase in post_meta.phase. These
 * are the phases and their display labels; a card with no phase reads as the
 * first one.
 */
export const DOING_COLUMN = 'DOING'

export const PHASES = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'planning', label: 'Planning' },
  { value: 'building', label: 'Building' },
  { value: 'testing', label: 'Testing' }
] as const

export function cardPhase(card: KanbanCardModel): string {
  const p = card.post_meta?.phase
  return typeof p === 'string' && p ? p : 'backlog'
}

export function phaseLabel(value: string | null | undefined): string {
  return PHASES.find(p => p.value === value)?.label ?? 'Backlog'
}

/**
 * Check if a card is overdue.
 */
export function isCardOverdue(
  card: KanbanCardModel,
  columnName: string | undefined
): boolean {
  if (!card?.due_date || columnName === 'DONE' || columnName === 'ARCHIVE') return false
  const t = Date.parse(card.due_date)
  if (Number.isNaN(t)) return false
  return t < Date.now()
}

/**
 * Qualitative rank — lower sorts first.
 * highest/critical=0, high=1, medium=2, low=3, null/unknown=99
 */
function qualRank(q: string | null | undefined): number {
  if (!q) return 99
  switch (q.toLowerCase()) {
    case 'highest':
    case 'critical':
      return 0
    case 'high':
      return 1
    case 'medium':
      return 2
    case 'low':
      return 3
    default:
      return 99
  }
}

/**
 * Sort cards by priority: qualitative rank first, then quantitative desc.
 * Returns a new array (does not mutate input).
 */
export function sortCardsByPriority(cards: KanbanCardModel[]): KanbanCardModel[] {
  if (!cards || cards.length === 0) return cards ?? []
  return [...cards].sort((a, b) => {
    const aQual = a.post_meta?.priority_qualitative ?? a.priority ?? null
    const bQual = b.post_meta?.priority_qualitative ?? b.priority ?? null
    const aRank = qualRank(typeof aQual === 'string' ? aQual : null)
    const bRank = qualRank(typeof bQual === 'string' ? bQual : null)
    if (aRank !== bRank) return aRank - bRank
    const aQuant = Number(a.post_meta?.priority_quantitative) || 0
    const bQuant = Number(b.post_meta?.priority_quantitative) || 0
    return bQuant - aQuant
  })
}

/**
 * Tailwind background class for the priority dot.
 */
export function priorityDotColor(qualitative: string | null | undefined): string {
  if (!qualitative) return ''
  switch (qualitative.toLowerCase()) {
    case 'highest':
    case 'critical':
      return 'bg-red-500'
    case 'high':
      return 'bg-orange-500'
    case 'medium':
      return 'bg-yellow-500'
    case 'low':
      return 'bg-gray-400'
    default:
      return ''
  }
}

/**
 * Post-type badge: single-letter label + bg/fg tailwind classes.
 */
export function postTypeBadge(
  postType: PostType | string | null | undefined
): { letter: string; bg: string; fg: string } {
  switch (postType) {
    case 'task':
      return { letter: 'T', bg: 'bg-blue-500', fg: 'text-white' }
    case 'feature':
      return { letter: 'F', bg: 'bg-purple-500', fg: 'text-white' }
    case 'bug':
      return { letter: 'B', bg: 'bg-red-500', fg: 'text-white' }
    case 'artifact':
      return { letter: 'A', bg: 'bg-orange-500', fg: 'text-white' }
    case 'feedback':
      return { letter: '!', bg: 'bg-amber-500', fg: 'text-white' }
    default:
      return { letter: '?', bg: 'bg-gray-400', fg: 'text-white' }
  }
}
