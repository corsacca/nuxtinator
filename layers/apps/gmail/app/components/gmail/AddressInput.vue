<script setup lang="ts">
// Recipient chips with autocomplete from previously seen addresses. Typing a
// new address (or "Name <addr>") and pressing Enter adds it.
import type { GmailAddressView } from '../../utils/gmail-format'

interface Item {
  label: string
  value: string
  name: string | null
}

const model = defineModel<GmailAddressView[]>({ required: true })
defineProps<{ placeholder?: string }>()

const searchTerm = ref('')
const suggestions = ref<Item[]>([])
let timer: ReturnType<typeof setTimeout> | null = null

function toItem(a: GmailAddressView): Item {
  return { label: a.name ? `${a.name} <${a.address}>` : a.address, value: a.address, name: a.name }
}

const selected = computed<Item[]>({
  get: () => model.value.map(toItem),
  set: (items) => {
    const seen = new Set<string>()
    model.value = items
      .map(i => ({ name: i.name ?? null, address: i.value.toLowerCase() }))
      .filter(a => (seen.has(a.address) ? false : (seen.add(a.address), true)))
  }
})

watch(searchTerm, (term) => {
  if (timer) clearTimeout(timer)
  const q = term.trim()
  if (q.length < 1) {
    suggestions.value = []
    return
  }
  timer = setTimeout(async () => {
    try {
      const res = await $fetch<{ addresses: { email: string, name: string | null }[] }>('/api/gmail/addresses', { params: { q } })
      suggestions.value = res.addresses
        .filter(a => !model.value.some(m => m.address === a.email))
        .map(a => toItem({ name: a.name, address: a.email }))
    } catch {
      suggestions.value = []
    }
  }, 150)
})

function parse(raw: string): GmailAddressView | null {
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(raw)
  const address = (m?.[2] ?? raw).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return null
  return { name: m?.[1]?.trim() || null, address }
}

function onCreate(raw: string) {
  const a = parse(raw)
  if (!a || model.value.some(m => m.address === a.address)) return
  model.value = [...model.value, a]
  searchTerm.value = ''
}
</script>

<template>
  <UInputMenu
    v-model="selected"
    v-model:search-term="searchTerm"
    :items="suggestions"
    multiple
    create-item="always"
    :placeholder="placeholder ?? 'Recipients'"
    size="sm"
    class="w-full"
    @create="onCreate"
  />
</template>
