<script setup lang="ts">
import { CONTEXT_VERSION_SOURCES, type ContextVersionSource } from '../../../../../utils/version-source'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const slug = computed(() => String(route.params.slug ?? ''))
const key = computed(() => String(route.params.key ?? ''))

interface VersionRow {
  id: string
  content: string
  edited_at: string
  edited_by: string | null
  edited_by_name: string | null
  source: ContextVersionSource | null
}

const { data, refresh } = await useAsyncData(
  () => `context-versions-${slug.value}-${key.value}`,
  () => $fetch<{ versions: VersionRow[] }>(`/api/context/portfolios/${slug.value}/sections/${key.value}/versions`)
)
const versions = computed(() => data.value?.versions ?? [])
const selectedId = ref<string | null>(null)
const selectedIndex = computed(() => {
  const idx = versions.value.findIndex(v => v.id === selectedId.value)
  return idx === -1 ? 0 : idx
})
const selected = computed(() => versions.value[selectedIndex.value] ?? null)
const previous = computed(() => versions.value[selectedIndex.value + 1] ?? null)
const restoringId = ref<string | null>(null)
const sidebarOpen = ref(false)

function label(idx: number): string {
  return idx === 0 ? 'Current' : `Version ${versions.value.length - idx}`
}

async function restore(id: string) {
  if (!confirm('Restore this version? This will create a new version at the head.')) return
  restoringId.value = id
  try {
    await $fetch(
      `/api/context/portfolios/${slug.value}/sections/${key.value}/versions/${id}/restore`,
      { method: 'POST' }
    )
    await refresh()
    selectedId.value = null
  } finally {
    restoringId.value = null
  }
}
</script>

<template>
  <div class="flex h-[calc(100vh-57px)] -mx-4 sm:-mx-6 lg:-mx-8 -my-6 lg:-my-8">
    <ContextSidebar v-model:open="sidebarOpen" />

    <section class="flex-1 flex flex-col min-w-0 border-l-0 lg:border-l border-(--ui-border) overflow-hidden">
      <header class="flex items-center gap-2 px-3 py-2 border-b border-(--ui-border) bg-(--ui-bg)">
        <UButton
          class="lg:hidden"
          icon="i-lucide-menu"
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Open sidebar"
          @click="sidebarOpen = true"
        />
        <UButton variant="ghost" icon="i-lucide-arrow-left" size="sm" :to="`/context/${slug}/sections/${key}`" />
        <h1 class="font-semibold">
          Version history
        </h1>
      </header>

      <div class="flex-1 flex flex-col md:flex-row gap-4 p-4 min-h-0">
        <SidebarPanel
          variant="floating"
          class="md:w-72 md:shrink-0 max-h-56 md:max-h-none"
        >
          <p
            v-if="versions.length === 0"
            class="px-2 text-sm text-(--ui-text-muted) italic"
          >
            No versions yet.
          </p>
          <ul
            v-else
            class="flex flex-col gap-1"
          >
            <li
              v-for="(v, idx) in versions"
              :key="v.id"
            >
              <button
                type="button"
                class="w-full text-left rounded-md px-3 py-2 hover:bg-(--ui-bg-accented)/50"
                :class="{ 'bg-(--ui-bg-accented)/50': idx === selectedIndex }"
                @click="selectedId = v.id"
              >
                <div class="text-sm font-medium">
                  {{ label(idx) }}
                </div>
                <div class="text-xs text-(--ui-text-muted)">
                  {{ new Date(v.edited_at).toLocaleString() }} · {{ v.edited_by_name ?? 'Unknown' }}
                </div>
                <UBadge
                  v-if="v.source"
                  :color="CONTEXT_VERSION_SOURCES[v.source].color"
                  :icon="CONTEXT_VERSION_SOURCES[v.source].icon"
                  variant="subtle"
                  size="xs"
                  class="mt-1"
                >
                  {{ CONTEXT_VERSION_SOURCES[v.source].label }}
                </UBadge>
              </button>
            </li>
          </ul>
        </SidebarPanel>

        <div class="flex-1 min-w-0 overflow-auto">
          <div
            v-if="selected"
            class="max-w-3xl mx-auto p-2"
          >
            <div class="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 class="font-semibold">
                  {{ label(selectedIndex) }}
                </h2>
                <p class="text-sm text-(--ui-text-muted)">
                  {{ !previous
                    ? 'First version'
                    : selected.content === previous.content ? 'No changes from the previous version' : 'Changes from the previous version' }}
                </p>
              </div>
              <UButton
                v-if="selectedIndex > 0"
                variant="outline"
                size="sm"
                :loading="restoringId === selected.id"
                @click="restore(selected.id)"
              >
                Restore
              </UButton>
            </div>
            <ContextTextDiff
              :before="previous?.content ?? ''"
              :after="selected.content"
              class="text-sm leading-6"
            />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
