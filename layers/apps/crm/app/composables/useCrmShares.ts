// Share state for one record: fetch on demand plus add/remove wrappers. All
// three endpoints answer with the full refreshed list, so `shares` is
// server-authoritative after every call — no optimistic bookkeeping.

import type { MaybeRefOrGetter } from 'vue'

export type CrmShareLevel = 'view' | 'edit'

/** A share as served by GET /api/crm/records/:type/:id/shares. */
export interface CrmShare {
  userId: string
  name: string
  email: string
  avatarUrl: string | null
  /** 'view' grants visibility only; 'edit' adds record-scoped update. */
  level: CrmShareLevel
  /** User who granted the share; null when that account was deleted. */
  grantedBy: string | null
  createdAt: string
}

export function useCrmShares(typeKey: MaybeRefOrGetter<string>, recordId: MaybeRefOrGetter<string>) {
  const shares = ref<CrmShare[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  const url = () => `/api/crm/records/${toValue(typeKey)}/${toValue(recordId)}/shares`

  async function refresh(): Promise<void> {
    if (!toValue(typeKey) || !toValue(recordId)) return
    pending.value = true
    try {
      const res = await $fetch<{ items: CrmShare[] }>(url())
      shares.value = res.items
      error.value = null
    } catch (err) {
      error.value = crmErrorMessage(err, 'Failed to load shares')
    } finally {
      pending.value = false
    }
  }

  /**
   * Shares the record with a user (default level 'view'). Re-posting with a
   * different level updates the existing share — the server upserts. Throws
   * on failure — callers surface the error.
   */
  async function addShare(userId: string, level?: CrmShareLevel): Promise<void> {
    const res = await $fetch<{ items: CrmShare[] }>(url(), {
      method: 'POST',
      body: level ? { userId, level } : { userId }
    })
    shares.value = res.items
  }

  /** Revokes a user's share. Throws on failure — callers surface the error. */
  async function removeShare(userId: string): Promise<void> {
    const res = await $fetch<{ items: CrmShare[] }>(`${url()}/${userId}`, {
      method: 'DELETE'
    })
    shares.value = res.items
  }

  return { shares, pending, error, refresh, addShare, removeShare }
}
