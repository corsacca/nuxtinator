/**
 * useColumnCollapse — localStorage-backed collapse state for kanban columns and cells.
 *
 * Keys are namespaced by an opaque string (`scope`) so the same composable can
 * be reused across orgs without state crosstalk. Pages typically pass the
 * active org slug as the scope.
 *
 * Default state when a key is missing: **true (expanded)**.
 */

const COLUMN_STORAGE_KEY = 'kanban-column-expanded-state'
const CELL_STORAGE_KEY = 'kanban-cell-expanded-state'
const OLD_COLUMN_STORAGE_KEY = 'kanban-column-collapse-state'

type ExpandedStateMap = Record<string, boolean>

let columnStateRef: Ref<ExpandedStateMap> | null = null
let cellStateRef: Ref<ExpandedStateMap> | null = null

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function loadState(storageKey: string, cleanupKey?: string): ExpandedStateMap {
  if (!isBrowser()) return {}
  try {
    if (cleanupKey) {
      localStorage.removeItem(cleanupKey)
    }
    const raw = localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ExpandedStateMap
    }
    return {}
  } catch (err) {
    console.error(`Error loading ${storageKey}:`, err)
    return {}
  }
}

function persist(storageKey: string, state: ExpandedStateMap): void {
  if (!isBrowser()) return
  try {
    localStorage.setItem(storageKey, JSON.stringify(state))
  } catch (err) {
    console.error(`Error saving ${storageKey}:`, err)
  }
}

function ensureColumnState(): Ref<ExpandedStateMap> {
  if (!columnStateRef) {
    columnStateRef = ref<ExpandedStateMap>(loadState(COLUMN_STORAGE_KEY, OLD_COLUMN_STORAGE_KEY))
  }
  return columnStateRef
}

function ensureCellState(): Ref<ExpandedStateMap> {
  if (!cellStateRef) {
    cellStateRef = ref<ExpandedStateMap>(loadState(CELL_STORAGE_KEY))
  }
  return cellStateRef
}

export function useColumnCollapse() {
  const columnState = ensureColumnState()
  const cellState = ensureCellState()

  function columnKey(scope: string, columnId: string): string {
    return `${scope}_${columnId}`
  }

  function cellKey(scope: string, columnId: string, swimlaneId: string): string {
    return `${scope}_${columnId}_${swimlaneId}`
  }

  function isColumnExpanded(scope: string, columnId: string): Ref<boolean> {
    return computed(() => {
      const key = columnKey(scope, columnId)
      const state = columnState.value
      return key in state ? state[key]! : true
    })
  }

  function toggleColumn(scope: string, columnId: string): void {
    const key = columnKey(scope, columnId)
    const current = key in columnState.value ? columnState.value[key]! : true
    const next: ExpandedStateMap = { ...columnState.value, [key]: !current }
    columnState.value = next
    persist(COLUMN_STORAGE_KEY, next)
  }

  function isCellExpanded(
    scope: string,
    columnId: string,
    swimlaneId: string
  ): Ref<boolean> {
    return computed(() => {
      const key = cellKey(scope, columnId, swimlaneId)
      const state = cellState.value
      return key in state ? state[key]! : true
    })
  }

  function toggleCell(scope: string, columnId: string, swimlaneId: string): void {
    const key = cellKey(scope, columnId, swimlaneId)
    const current = key in cellState.value ? cellState.value[key]! : true
    const next: ExpandedStateMap = { ...cellState.value, [key]: !current }
    cellState.value = next
    persist(CELL_STORAGE_KEY, next)
  }

  function resetAll(): void {
    columnState.value = {}
    cellState.value = {}
    if (isBrowser()) {
      localStorage.removeItem(COLUMN_STORAGE_KEY)
      localStorage.removeItem(CELL_STORAGE_KEY)
    }
  }

  return {
    isColumnExpanded,
    toggleColumn,
    isCellExpanded,
    toggleCell,
    resetAll
  }
}
