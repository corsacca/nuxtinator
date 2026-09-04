// Connected accounts: list, connect, edit, disconnect, sync now.

export interface GmailAccount {
  id: string
  email: string
  displayName: string | null
  signatureHtml: string | null
  status: string
  lastError: string | null
  backfillDone: boolean
  lastSyncAt: string | null
  createdAt: string
}

const _accounts = () => useState<GmailAccount[]>('gmail-accounts', () => [])
const _loaded = () => useState<boolean>('gmail-accounts-loaded', () => false)

export function useGmailAccounts() {
  const accounts = _accounts()
  const loaded = _loaded()
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function refresh(): Promise<void> {
    pending.value = true
    error.value = null
    try {
      const res = await $fetch<{ accounts: GmailAccount[] }>('/api/gmail/accounts')
      accounts.value = res.accounts
      loaded.value = true
    } catch (err) {
      error.value = gmailErrorMessage(err) ?? 'Could not load accounts'
    } finally {
      pending.value = false
    }
  }

  async function connect(input: { email: string, password: string, displayName?: string | null }): Promise<GmailAccount> {
    const res = await $fetch<{ account: GmailAccount }>('/api/gmail/accounts', { method: 'POST', body: input })
    await refresh()
    return res.account
  }

  async function update(id: string, patch: { displayName?: string | null, signatureHtml?: string | null, password?: string }): Promise<GmailAccount> {
    const res = await $fetch<{ account: GmailAccount }>(`/api/gmail/accounts/${id}`, { method: 'PATCH', body: patch })
    await refresh()
    return res.account
  }

  async function disconnect(id: string): Promise<void> {
    await $fetch(`/api/gmail/accounts/${id}`, { method: 'DELETE' })
    await refresh()
  }

  async function syncNow(id: string): Promise<void> {
    await $fetch(`/api/gmail/accounts/${id}/sync`, { method: 'POST' })
    await refresh()
  }

  const byId = computed(() => new Map(accounts.value.map(a => [a.id, a])))
  const selfAddresses = computed(() => new Set(accounts.value.map(a => a.email.toLowerCase())))
  const order = computed(() => accounts.value.map(a => a.id))

  return { accounts, loaded, pending, error, refresh, connect, update, disconnect, syncNow, byId, selfAddresses, order }
}
