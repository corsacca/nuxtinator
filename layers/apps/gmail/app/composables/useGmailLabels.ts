// User labels across the caller's accounts, plus label creation.

export interface GmailLabel {
  id: string
  accountId: string
  path: string
  name: string
}

export function useGmailLabels() {
  const labels = ref<GmailLabel[]>([])
  const pending = ref(false)

  async function refresh(): Promise<void> {
    pending.value = true
    try {
      const res = await $fetch<{ labels: GmailLabel[] }>('/api/gmail/labels')
      labels.value = res.labels
    } finally {
      pending.value = false
    }
  }

  async function create(accountId: string, name: string): Promise<GmailLabel | null> {
    const res = await $fetch<{ label: GmailLabel | null }>('/api/gmail/labels', { method: 'POST', body: { accountId, name } })
    await refresh()
    return res.label
  }

  // Distinct label paths (the rail shows one folder per name even when two
  // accounts both have it).
  const paths = computed(() => [...new Set(labels.value.map(l => l.path))].sort((a, b) => a.localeCompare(b)))

  onMounted(() => {
    refresh()
  })

  return { labels, paths, pending, refresh, create }
}
