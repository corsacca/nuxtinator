<script setup lang="ts">
// Search + status filter bar for the list page. `q` and `status` bind to
// the URL-backed list state; the search input debounces before writing so
// typing doesn't fire a request per keystroke. The status select appears
// only when the type has a key_select status field.
import type { CrmFieldSetting } from '../../utils/field-kinds'

const props = defineProps<{
  statusField: CrmFieldSetting | null
}>()

const q = defineModel<string>('q', { default: '' })
const status = defineModel<string | null>('status', { default: null })

const search = ref(q.value)
watch(q, (v) => {
  if (v !== search.value) search.value = v
})

let timer: ReturnType<typeof setTimeout> | null = null
watch(search, (v) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    q.value = v
  }, 250)
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

interface StatusItem {
  label: string
  value: string | null
}

const statusItems = computed<StatusItem[]>(() => {
  const options = props.statusField?.options
  if (!options) return []
  return [
    { label: 'All statuses', value: null },
    ...Object.entries(options)
      .filter(([, opt]) => !opt.deleted)
      .map(([key, opt]) => ({ label: opt.label, value: key as string | null }))
  ]
})
</script>

<template>
  <div class="flex flex-col sm:flex-row gap-2">
    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="Search..."
      class="flex-1"
    />
    <USelectMenu
      v-if="statusField"
      v-model="status"
      :items="statusItems"
      value-key="value"
      label-key="label"
      placeholder="Status"
      class="sm:w-48"
    />
  </div>
</template>
