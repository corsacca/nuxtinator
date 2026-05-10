// Persists per-swimlane (or per-collapsed-project) row heights to localStorage.
// Keys:
//   lane://{scope}/{swimlaneId}   — expanded project, one row per lane
//   proj://{scope}/{projectId}    — collapsed project, one pooled row
// Default height is 320px (matches the design Kanban cell h-80).

const DEFAULT_HEIGHT = 320
const MIN_HEIGHT = 120
const MAX_HEIGHT = 1200
const STORAGE_KEY = 'kanban-swimlane-heights'

let cache: Record<string, number> | null = null

function load(): Record<string, number> {
  if (cache) return cache
  if (!import.meta.client) return (cache = {})
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    cache = raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    cache = {}
  }
  return cache!
}

function save() {
  if (!import.meta.client || !cache) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // quota exceeded or privacy mode — ignore
  }
}

export interface SwimlaneHeightState {
  heights: Ref<Record<string, number>>
  getHeight: (key: string) => number
  setHeight: (key: string, px: number) => void
  resetHeight: (key: string) => void
  laneKey: (scope: string, swimlaneId: string) => string
  projectKey: (scope: string, projectId: string) => string
  DEFAULT_HEIGHT: number
  MIN_HEIGHT: number
  MAX_HEIGHT: number
}

export function useSwimlaneHeight(): SwimlaneHeightState {
  const heights = useState<Record<string, number>>('swimlane-heights', () => load())

  function getHeight(key: string): number {
    const v = heights.value[key]
    return typeof v === 'number' && v >= MIN_HEIGHT ? v : DEFAULT_HEIGHT
  }

  function setHeight(key: string, px: number) {
    const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(px)))
    heights.value = { ...heights.value, [key]: clamped }
    cache = heights.value
    save()
  }

  function resetHeight(key: string) {
    const next = { ...heights.value }
    delete next[key]
    heights.value = next
    cache = heights.value
    save()
  }

  return {
    heights,
    getHeight,
    setHeight,
    resetHeight,
    laneKey: (scope, swimlaneId) => `lane://${scope}/${swimlaneId}`,
    projectKey: (scope, projectId) => `proj://${scope}/${projectId}`,
    DEFAULT_HEIGHT,
    MIN_HEIGHT,
    MAX_HEIGHT
  }
}
