<script setup lang="ts">
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
}

const { data, refresh } = await useAsyncData(
  () => `context-versions-${slug.value}-${key.value}`,
  () => $fetch<{ versions: VersionRow[] }>(`/api/context/portfolios/${slug.value}/sections/${key.value}/versions`)
)
const versions = computed(() => data.value?.versions ?? [])
const restoringId = ref<string | null>(null)
const sidebarOpen = ref(false)

async function restore(id: string) {
  if (!confirm('Restore this version? This will create a new version at the head.')) return
  restoringId.value = id
  try {
    await $fetch(
      `/api/context/portfolios/${slug.value}/sections/${key.value}/versions/${id}/restore`,
      { method: 'POST' }
    )
    await refresh()
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

      <div class="flex-1 overflow-auto p-6">
        <div class="max-w-3xl mx-auto">
          <SidebarPanel class="rounded-lg overflow-hidden">
            <ul class="divide-y divide-(--ui-border)">
              <li v-for="(v, idx) in versions" :key="v.id" class="p-4">
                <div class="flex items-center justify-between mb-2">
                  <div>
                    <div class="font-medium">
                      {{ idx === 0 ? 'Current' : `Version ${versions.length - idx}` }}
                    </div>
                    <div class="text-sm text-(--ui-text-muted)">
                      {{ new Date(v.edited_at).toLocaleString() }} · {{ v.edited_by_name ?? 'Unknown' }}
                    </div>
                  </div>
                  <UButton
                    v-if="idx > 0"
                    variant="outline"
                    size="sm"
                    :loading="restoringId === v.id"
                    @click="restore(v.id)"
                  >
                    Restore
                  </UButton>
                </div>
                <pre class="text-xs bg-(--ui-bg-elevated) p-3 rounded max-h-48 overflow-auto whitespace-pre-wrap">{{ v.content }}</pre>
              </li>
            </ul>
          </SidebarPanel>
        </div>
      </div>
    </section>
  </div>
</template>
