<script setup lang="ts">
// Per-user tag picker popover. Loads the user's tag vocabulary, lets them
// add or remove a tag for the item, and create new tags on the fly.

const props = defineProps<{
  itemId: string
  myTags: string[]
}>()

const emit = defineEmits<{
  changed: []
}>()

const open = ref(false)
const allTags = ref<string[]>([])
const filter = ref('')
const loading = ref(false)

async function loadVocabulary() {
  loading.value = true
  try {
    const res = await $fetch<{ tags: Array<{ name: string }> }>('/api/messages/tags')
    allTags.value = res.tags.map(t => t.name)
  } finally {
    loading.value = false
  }
}

watch(open, (v) => {
  if (v) loadVocabulary()
})

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return allTags.value
  return allTags.value.filter(t => t.toLowerCase().includes(q))
})

const canCreate = computed(() => {
  const q = filter.value.trim().replace(/^#/, '')
  return q.length > 0 && !allTags.value.includes(q)
})

async function toggle(tag: string) {
  const has = props.myTags.includes(tag)
  if (has) {
    await $fetch(`/api/messages/items/${props.itemId}/tags`, {
      method: 'DELETE',
      body: { tag }
    })
  } else {
    await $fetch(`/api/messages/items/${props.itemId}/tags`, {
      method: 'POST',
      body: { tag }
    })
  }
  emit('changed')
  open.value = false
}

async function createAndApply() {
  const tag = filter.value.trim().replace(/^#/, '')
  if (!tag) return
  await $fetch(`/api/messages/items/${props.itemId}/tags`, {
    method: 'POST',
    body: { tag }
  })
  filter.value = ''
  emit('changed')
  open.value = false
}
</script>

<template>
  <UPopover v-model:open="open" :ui="{ content: 'w-64' }">
    <button class="tag-trigger" aria-label="Tag this item">
      <UIcon name="i-lucide-tag" class="size-3.5" />
    </button>
    <template #content>
      <div class="flex flex-col">
        <div class="px-3 py-2 border-b border-(--ui-border)">
          <UInput
            v-model="filter"
            placeholder="Filter or create tag..."
            size="sm"
          />
        </div>
        <div class="max-h-56 overflow-y-auto p-1">
          <button
            v-for="tag in filtered"
            :key="tag"
            class="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-(--ui-bg-elevated) text-sm"
            @click="toggle(tag)"
          >
            <span>#{{ tag }}</span>
            <UIcon
              v-if="myTags.includes(tag)"
              name="i-lucide-check"
              class="size-4 text-(--ui-primary)"
            />
          </button>
          <button
            v-if="canCreate"
            class="w-full flex items-center gap-1 px-2 py-1 rounded hover:bg-(--ui-bg-elevated) text-sm text-(--ui-primary)"
            @click="createAndApply"
          >
            <UIcon name="i-lucide-plus" class="size-3.5" />
            <span>Create #{{ filter.trim().replace(/^#/, '') }}</span>
          </button>
          <div v-if="!loading && filtered.length === 0 && !canCreate" class="px-2 py-3 text-center text-xs text-(--ui-text-muted)">
            No tags yet.
          </div>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
.tag-trigger {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  color: var(--ui-text-muted);
}
.tag-trigger:hover {
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
}
</style>
