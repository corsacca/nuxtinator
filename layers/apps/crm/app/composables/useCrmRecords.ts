// List state for one record type, bound to the URL query (q, status, sort,
// dir, page) so views are shareable and survive reloads. Every query change
// triggers a refetch; stale responses are dropped.

import type { MaybeRefOrGetter } from 'vue'

/** A list row as served by GET /api/crm/records/:type. */
export interface CrmRecordListItem {
  id: string
  name: string
  status: string | null
  updatedAt: string
  createdAt: string
  assignedTo: string[]
  /** Raw jsonb map — holds values for jsonb-stored fields only. */
  data: Record<string, unknown>
}

export const CRM_LIST_PAGE_SIZE = 25

export function useCrmRecords(typeKey: MaybeRefOrGetter<string>) {
  const route = useRoute()
  const router = useRouter()

  const items = ref<CrmRecordListItem[]>([])
  const total = ref(0)
  const pending = ref(false)
  const error = ref<string | null>(null)

  function queryString(key: string): string {
    const raw = route.query[key]
    if (typeof raw === 'string') return raw
    if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
    return ''
  }

  /** Merges a patch into the current query; empty values remove the key. */
  function setQuery(patch: Record<string, string | undefined>) {
    const merged: Record<string, unknown> = { ...route.query, ...patch }
    const next = Object.fromEntries(
      Object.entries(merged).filter(([, value]) => value !== undefined && value !== '')
    )
    router.replace({ query: next as Record<string, string> })
  }

  const q = computed<string>({
    get: () => queryString('q'),
    set: v => setQuery({ q: v || undefined, page: undefined })
  })

  const status = computed<string | null>({
    get: () => queryString('status') || null,
    set: v => setQuery({ status: v || undefined, page: undefined })
  })

  const sort = computed<string>(() => queryString('sort') || 'updated_at')
  const dir = computed<'asc' | 'desc'>(() => {
    const raw = queryString('dir')
    if (raw === 'asc' || raw === 'desc') return raw
    return 'desc'
  })

  function toggleSort(field: string) {
    if (sort.value === field) {
      setQuery({ sort: field, dir: dir.value === 'asc' ? 'desc' : 'asc', page: undefined })
    } else {
      // Timestamps read most-recent-first; everything else starts ascending.
      const firstDir = field === 'updated_at' || field === 'created_at' ? 'desc' : 'asc'
      setQuery({ sort: field, dir: firstDir, page: undefined })
    }
  }

  const page = computed<number>({
    get: () => {
      const n = Number.parseInt(queryString('page'), 10)
      return Number.isFinite(n) && n > 0 ? n : 1
    },
    set: v => setQuery({ page: v > 1 ? String(v) : undefined })
  })

  let requestId = 0
  async function refresh(): Promise<void> {
    const key = toValue(typeKey)
    if (!key) return
    const id = ++requestId
    pending.value = true
    try {
      const res = await $fetch<{ items: CrmRecordListItem[], total: number }>(
        `/api/crm/records/${key}`,
        {
          query: {
            q: q.value || undefined,
            sort: sort.value,
            dir: dir.value,
            limit: CRM_LIST_PAGE_SIZE,
            offset: (page.value - 1) * CRM_LIST_PAGE_SIZE,
            filters: status.value ? JSON.stringify({ status: status.value }) : undefined
          }
        }
      )
      if (id !== requestId) return
      items.value = res.items
      total.value = res.total
      error.value = null
    } catch (err) {
      if (id !== requestId) return
      error.value = crmErrorMessage(err, 'Failed to load records')
    } finally {
      if (id === requestId) pending.value = false
    }
  }

  watch(
    () => [toValue(typeKey), q.value, status.value, sort.value, dir.value, page.value],
    () => {
      refresh()
    },
    { immediate: true }
  )

  return {
    items,
    total,
    pending,
    error,
    page,
    pageSize: CRM_LIST_PAGE_SIZE,
    q,
    status,
    sort,
    dir,
    toggleSort,
    refresh
  }
}
