// Record-type catalog + per-type field settings, fetched lazily and cached
// in useState so every component in the tree shares one copy.

import type { CrmFieldSetting, CrmTypeSections } from '../utils/field-kinds'

/** A record type as served by GET /api/crm/schema/types. */
export interface CrmTypeSummary {
  key: string
  label: string
  labelSingular: string
  icon: string | null
  hidden: boolean
  custom: boolean
  orphan: boolean
}

/** Response of GET /api/crm/schema/types/:type/fields. */
export interface CrmTypeFields {
  sections: CrmTypeSections
  fields: CrmFieldSetting[]
}

// In-flight request dedupe. SSR is off, so plain module state is safe.
let typesPromise: Promise<void> | null = null
const fieldsPromises = new Map<string, Promise<CrmTypeFields>>()

export function useCrmTypes() {
  const types = useState<CrmTypeSummary[]>('crm:types', () => [])
  const typesLoaded = useState<boolean>('crm:types-loaded', () => false)
  const pending = useState<boolean>('crm:types-pending', () => false)
  const fieldsCache = useState<Record<string, CrmTypeFields>>('crm:fields', () => ({}))

  // Hidden/orphan entries come back for schema managers; navigation only
  // ever shows the visible ones.
  const visibleTypes = computed(() => types.value.filter(t => !t.hidden && !t.orphan))

  async function fetchTypes(): Promise<void> {
    pending.value = true
    try {
      const res = await $fetch<{ types: CrmTypeSummary[] }>('/api/crm/schema/types')
      types.value = res.types
      typesLoaded.value = true
    } finally {
      pending.value = false
    }
  }

  /** Fetches the type catalog once; concurrent callers share the request. */
  function ensureTypes(): Promise<void> {
    if (typesLoaded.value) return Promise.resolve()
    if (!typesPromise) {
      typesPromise = fetchTypes().finally(() => {
        typesPromise = null
      })
    }
    return typesPromise
  }

  /** Field settings for one type, fetched on first use and cached. */
  function getFields(typeKey: string): Promise<CrmTypeFields> {
    const hit = fieldsCache.value[typeKey]
    if (hit) return Promise.resolve(hit)
    let inflight = fieldsPromises.get(typeKey)
    if (!inflight) {
      inflight = $fetch<CrmTypeFields>(`/api/crm/schema/types/${typeKey}/fields`)
        .then((res) => {
          fieldsCache.value = { ...fieldsCache.value, [typeKey]: res }
          return res
        })
        .finally(() => {
          fieldsPromises.delete(typeKey)
        })
      fieldsPromises.set(typeKey, inflight)
    }
    return inflight
  }

  /** Drops every cache and refetches the catalog. */
  async function refresh(): Promise<void> {
    fieldsCache.value = {}
    typesLoaded.value = false
    await ensureTypes()
  }

  return { types, visibleTypes, pending, ensureTypes, getFields, refresh }
}

// Builds an app-local path that keeps the multi-tenant org prefix on
// internal navigation (same pattern as messages' pathFor). In single mode
// there is no orgSlug param and the plain path comes back.
export function useCrmPath() {
  const route = useRoute()
  return (path: string): string => {
    const raw = route.params?.orgSlug
    const slug = typeof raw === 'string' && raw.length > 0
      ? raw
      : (Array.isArray(raw) && raw.length > 0 ? raw[0] : null)
    return slug ? `/@${slug}/crm${path}` : `/crm${path}`
  }
}
