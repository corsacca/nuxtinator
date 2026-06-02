<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const slug = computed(() => String(route.params.slug ?? ''))
const key = computed(() => String(route.params.key ?? ''))

interface SectionData {
  portfolio_id: string
  key: string
  title: string
  description: string
  is_custom: boolean
  content: string
  last_edited_at: string | null
  last_edited_by_name: string | null
}

const { data, refresh } = await useAsyncData(
  () => `context-section-${slug.value}-${key.value}`,
  () => $fetch<SectionData>(`/api/context/portfolios/${slug.value}/sections/${key.value}`)
)

const editing = ref(false)
const draft = ref(data.value?.content ?? '')
const saving = ref(false)
const error = ref<string | null>(null)
const showAssistant = ref(false)
const sidebarOpen = ref(false)

watch(data, (next) => {
  if (next && !editing.value) draft.value = next.content
})

const wordCount = computed(() => {
  const t = (editing.value ? draft.value : data.value?.content ?? '').trim()
  return t ? t.split(/\s+/).length : 0
})

function startEdit() {
  draft.value = data.value?.content ?? ''
  editing.value = true
}

function cancelEdit() {
  draft.value = data.value?.content ?? ''
  editing.value = false
  error.value = null
}

async function save() {
  saving.value = true
  error.value = null
  try {
    await $fetch(`/api/context/portfolios/${slug.value}/sections/${key.value}`, {
      method: 'PUT',
      body: { content: draft.value }
    })
    await refresh()
    editing.value = false
  } catch (e) {
    error.value = (e as Error).message ?? 'Save failed.'
  } finally {
    saving.value = false
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
        <div class="flex-1 min-w-0">
          <h1 class="font-semibold truncate">
            {{ data?.title ?? key }}
          </h1>
          <p v-if="data?.description" class="text-xs text-(--ui-text-muted) truncate">
            {{ data.description }}
          </p>
        </div>
        <UButton variant="ghost" icon="i-lucide-sparkles" size="sm" @click="showAssistant = !showAssistant">
          Assistant
        </UButton>
        <UButton variant="outline" icon="i-lucide-history" size="sm" :to="`/context/${slug}/sections/${key}/versions`">
          History
        </UButton>
        <template v-if="editing">
          <UButton variant="ghost" size="sm" @click="cancelEdit">
            Cancel
          </UButton>
          <UButton color="primary" size="sm" :loading="saving" @click="save">
            Save
          </UButton>
        </template>
        <UButton v-else color="primary" variant="outline" icon="i-lucide-pencil" size="sm" @click="startEdit">
          Edit
        </UButton>
      </header>

      <ContextMarkdownToolbar v-if="editing" :textarea-id="`section-editor-${key}`" />

      <div class="flex-1 flex min-h-0">
        <div class="flex-1 flex min-h-0 overflow-auto">
          <textarea
            v-if="editing"
            :id="`section-editor-${key}`"
            v-model="draft"
            class="flex-1 w-full h-full p-6 font-mono text-sm outline-none bg-(--ui-bg) resize-none"
            placeholder="Start writing in markdown…"
          />
          <div v-else class="flex-1 p-6 overflow-auto">
            <div v-if="!data?.content" class="text-(--ui-text-muted) text-sm italic">
              This section is empty. Click <strong>Edit</strong> to add content.
            </div>
            <ContextSectionPreview v-else :content="data.content" />
          </div>
        </div>

        <SidebarPanel v-if="showAssistant" class="w-96 border-l border-(--ui-border) overflow-hidden">
          <ContextAssistantPanel :slug="slug" :current-key="key" @applied="refresh" />
        </SidebarPanel>
      </div>

      <footer class="flex items-center gap-3 px-3 py-1.5 border-t border-(--ui-border) bg-(--ui-bg) text-xs text-(--ui-text-muted)">
        <span>{{ wordCount }} words</span>
        <span v-if="data?.last_edited_at">
          · last edited {{ new Date(data.last_edited_at).toLocaleString() }}
          <span v-if="data.last_edited_by_name"> by {{ data.last_edited_by_name }}</span>
        </span>
        <span class="flex-1" />
        <span v-if="error" class="text-(--ui-error)">{{ error }}</span>
      </footer>
    </section>
  </div>
</template>
