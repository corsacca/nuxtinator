export interface GmailPrefs {
  undoSendSeconds: number
}

export function useGmailPrefs() {
  const prefs = ref<GmailPrefs | null>(null)
  const limits = ref<{ undoSendSeconds: { min: number, max: number } } | null>(null)
  const pending = ref(false)

  async function refresh(): Promise<void> {
    pending.value = true
    try {
      const res = await $fetch<{ prefs: GmailPrefs, limits: { undoSendSeconds: { min: number, max: number } } }>('/api/gmail/prefs')
      prefs.value = res.prefs
      limits.value = res.limits
    } finally {
      pending.value = false
    }
  }

  async function save(patch: Partial<GmailPrefs>): Promise<void> {
    const res = await $fetch<{ prefs: GmailPrefs }>('/api/gmail/prefs', { method: 'PUT', body: patch })
    prefs.value = res.prefs
  }

  return { prefs, limits, pending, refresh, save }
}
