import type { KanbanCardModel } from '../components/kanban/types'

/**
 * Signal Clusters configuration — code-owned, never persisted.
 *
 * The grouping axes, their human labels, and the facet filters are declared
 * here in code (the DB stores none of this). Adding an axis or renaming a label
 * is a code change, not a migration: per the persisted-state convention, the
 * database holds only the cards' own fields; grouping/labelling is pure
 * read-time presentation derived from those fields.
 */

export interface ClusterAxis {
  /** Stable key used in the group-by selector and UI state. */
  value: string
  /** Human label shown in the selector. */
  label: string
  /** Icon for the selector option. */
  icon: string
  /**
   * Derives the group key for a single card. Returns a stable string used both
   * to bucket cards and (after `groupLabel`) to title the panel. Unknowns
   * collapse into a sentinel so they cluster together rather than scatter.
   */
  keyOf: (card: KanbanCardModel, ctx: ClusterContext) => string
  /** Turns a raw group key into the panel heading. */
  groupLabel: (key: string, ctx: ClusterContext) => string
}

/** Lookups the axes need that don't live on the card itself. */
export interface ClusterContext {
  /** project_id → project name, for the "project" axis label. */
  projectNames: Record<string, string>
}

/** Sentinel group key for cards missing the grouped field. */
export const UNKNOWN_KEY = '__unknown__'
const UNKNOWN_LABEL = 'Unknown'

function pm(card: KanbanCardModel): Record<string, any> {
  return card.post_meta || {}
}

function clientContext(card: KanbanCardModel): Record<string, any> {
  const cc = pm(card).client_context
  return cc && typeof cc === 'object' ? cc : {}
}

function nonEmpty(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * The available group-by axes. Order here is the order shown in the selector;
 * the first entry is the default axis.
 */
export const CLUSTER_AXES: ClusterAxis[] = [
  {
    value: 'sub_type',
    label: 'Type (bug / idea)',
    icon: 'i-lucide-tags',
    keyOf: card => nonEmpty(pm(card).feedback_sub_type) ?? UNKNOWN_KEY,
    groupLabel: key => (key === UNKNOWN_KEY ? UNKNOWN_LABEL : titleCase(key))
  },
  {
    value: 'page_path',
    label: 'Page path',
    icon: 'i-lucide-link',
    keyOf: card => nonEmpty(pm(card).page_path) ?? UNKNOWN_KEY,
    groupLabel: key => (key === UNKNOWN_KEY ? 'No page path' : key)
  },
  {
    value: 'device_type',
    label: 'Device type',
    icon: 'i-lucide-smartphone',
    keyOf: card => nonEmpty(clientContext(card).device_type) ?? UNKNOWN_KEY,
    groupLabel: key => (key === UNKNOWN_KEY ? UNKNOWN_LABEL : titleCase(key))
  },
  {
    value: 'platform',
    label: 'Platform / OS',
    icon: 'i-lucide-monitor',
    keyOf: card => nonEmpty(clientContext(card).platform) ?? UNKNOWN_KEY,
    groupLabel: key => (key === UNKNOWN_KEY ? UNKNOWN_LABEL : key)
  },
  {
    value: 'submitter',
    label: 'Anonymous vs. known',
    icon: 'i-lucide-user-round',
    keyOf: (card) => {
      const meta = pm(card)
      // Anonymous when the submission was not tied to a signed-in user. The
      // explicit flag wins; fall back to absence of a submitter user id.
      const anon = meta.submitter_anonymous === true
        || (meta.submitter_anonymous === undefined && !meta.submitter_user_id)
      return anon ? 'anonymous' : 'known'
    },
    groupLabel: key => (key === 'anonymous' ? 'Anonymous' : 'Known submitter')
  },
  {
    value: 'project',
    label: 'Project',
    icon: 'i-lucide-folder',
    keyOf: card => card.project_id || UNKNOWN_KEY,
    groupLabel: (key, ctx) =>
      key === UNKNOWN_KEY ? UNKNOWN_LABEL : (ctx.projectNames[key] || 'Untitled project')
  }
]

export const DEFAULT_AXIS = CLUSTER_AXES[0]!.value

export function getAxis(value: string): ClusterAxis {
  return CLUSTER_AXES.find(a => a.value === value) ?? CLUSTER_AXES[0]!
}

/** Sub-type display metadata (icon + label) for member rows and facet chips. */
export const SUB_TYPE_META: Record<string, { label: string, icon: string }> = {
  bug: { label: 'Bug', icon: 'i-lucide-bug' },
  idea: { label: 'Idea', icon: 'i-lucide-lightbulb' }
}

export function subTypeMeta(card: KanbanCardModel): { label: string, icon: string } {
  const t = nonEmpty(pm(card).feedback_sub_type) ?? ''
  return SUB_TYPE_META[t] ?? { label: titleCase(t || 'Item'), icon: 'i-lucide-message-square' }
}
