<script setup lang="ts">
// Searchable icon selector. Browses the host's installed Iconify collections
// (names come from /api/_icons via useIconCatalog) and emits the full
// `i-<prefix>-<name>` string. Any query can also be applied verbatim through
// the "use as-is" row — that keeps names from collections this picker doesn't
// browse, and short text labels (which AppIcon renders as text instead of an
// icon), reachable.
const props = withDefaults(defineProps<{
  /** Collection prefixes to browse, in display order. */
  collections?: string[]
  disabled?: boolean
  placeholder?: string
}>(), {
  collections: () => ['lucide'],
  disabled: false,
  placeholder: 'Choose an icon…'
})

const model = defineModel<string | null>({ default: null })

const open = ref(false)
const query = ref('')

const catalog = useIconCatalog()

watch(open, (v) => {
  if (!v) return
  query.value = ''
  catalog.load()
})

// Rendering a match spawns a <UIcon> that fetches its glyph, so the visible
// slice is capped; search narrows within the full name list.
const RENDER_CAP = 120

const allNames = computed<string[]>(() => {
  const loaded = catalog.collections.value
  if (!loaded) return []
  return props.collections.flatMap((prefix) => {
    const collection = loaded.find(c => c.prefix === prefix)
    return collection ? collection.names.map(n => `i-${prefix}-${n}`) : []
  })
})

// Strip a leading `i-` so pasting a full name (`i-lucide-mail`) matches.
const normalizedQuery = computed(() =>
  query.value.trim().toLowerCase().replace(/^i-/, '')
)

const matches = computed(() => {
  const q = normalizedQuery.value
  if (!q) return allNames.value
  return allNames.value.filter(n => n.includes(q))
})

const visible = computed(() => matches.value.slice(0, RENDER_CAP))

const customCandidate = computed(() => {
  const raw = query.value.trim()
  if (!raw) return null
  return allNames.value.includes(raw) ? null : raw
})

function pick(name: string) {
  model.value = name
  open.value = false
}

function clear() {
  model.value = null
  open.value = false
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :ui="{ content: 'w-72' }"
  >
    <button
      type="button"
      class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-(--ui-border) text-sm text-left enabled:hover:border-(--ui-border-accented) disabled:opacity-50 disabled:cursor-not-allowed"
      :disabled="disabled"
    >
      <template v-if="model">
        <AppIcon
          :name="model"
          class="size-4 shrink-0"
        />
        <span class="flex-1 truncate font-mono text-xs">{{ model }}</span>
      </template>
      <span
        v-else
        class="flex-1 truncate text-(--ui-text-muted)"
      >{{ placeholder }}</span>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-4 shrink-0 text-(--ui-text-muted)"
      />
    </button>
    <template #content>
      <div class="flex flex-col">
        <div class="px-3 py-2 border-b border-(--ui-border)">
          <UInput
            v-model="query"
            placeholder="Search icons…"
            size="sm"
            autofocus
            class="w-full"
          />
        </div>
        <div class="max-h-64 overflow-y-auto p-2">
          <div
            v-if="catalog.loading.value"
            class="px-2 py-4 text-center text-xs text-(--ui-text-muted)"
          >
            Loading icons…
          </div>
          <template v-else>
            <div class="grid grid-cols-8 gap-0.5">
              <button
                v-for="name in visible"
                :key="name"
                type="button"
                class="flex items-center justify-center rounded p-1.5 hover:bg-(--ui-bg-elevated)"
                :class="name === model ? 'bg-(--ui-bg-elevated) text-(--ui-primary)' : ''"
                :title="name"
                @click="pick(name)"
              >
                <UIcon
                  :name="name"
                  class="size-5"
                />
              </button>
            </div>
            <div
              v-if="matches.length > RENDER_CAP"
              class="px-2 pt-2 text-center text-xs text-(--ui-text-muted)"
            >
              Showing {{ RENDER_CAP }} of {{ matches.length }} — keep typing to narrow down.
            </div>
            <div
              v-else-if="matches.length === 0 && !customCandidate"
              class="px-2 py-4 text-center text-xs text-(--ui-text-muted)"
            >
              No matching icons.
            </div>
          </template>
        </div>
        <div
          v-if="customCandidate || model"
          class="border-t border-(--ui-border) p-1"
        >
          <button
            v-if="customCandidate"
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-(--ui-bg-elevated) text-sm text-(--ui-primary)"
            @click="pick(customCandidate)"
          >
            <UIcon
              name="i-lucide-plus"
              class="size-3.5 shrink-0"
            />
            <span class="truncate">Use “{{ customCandidate }}” as-is</span>
          </button>
          <button
            v-if="model"
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-(--ui-bg-elevated) text-sm text-(--ui-text-muted)"
            @click="clear"
          >
            <UIcon
              name="i-lucide-x"
              class="size-3.5 shrink-0"
            />
            <span>No icon — use the default</span>
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>
