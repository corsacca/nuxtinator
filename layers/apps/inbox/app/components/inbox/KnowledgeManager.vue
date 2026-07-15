<script setup lang="ts">
import type { InboxKnowledgeEntry } from '../../composables/useInboxKnowledge'

// Two-pane knowledge-base manager: list on the left, editor on the right, plus a
// manual grounding-refresh. Opened from the inbox toolbar. Mutations are gated by
// `canManage` (inbox.send); the server enforces regardless.
const props = defineProps<{ canManage: boolean }>()
const open = defineModel<boolean>('open', { required: true })

const toast = useToast()
const { items, statusFilter, loaded, refresh, create, update, remove, refreshGrounding } = useInboxKnowledge()

type Draft = { id: string | null, question: string, answer: string, language: string, status: string }
const selected = ref<Draft | null>(null)
const saving = ref(false)
const refreshing = ref(false)

const STATUS_ITEMS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' }
]

watch(open, (v) => {
  if (v) {
    selected.value = null
    refresh()
  }
})

function edit(entry: InboxKnowledgeEntry) {
  selected.value = { id: entry.id, question: entry.question, answer: entry.answer, language: entry.language, status: entry.status }
}

function newEntry() {
  selected.value = { id: null, question: '', answer: '', language: 'en', status: 'active' }
}

const canSave = computed(() => !!selected.value && selected.value.question.trim().length > 0 && selected.value.answer.trim().length > 0)

async function save() {
  const d = selected.value
  if (!d || !canSave.value) return
  saving.value = true
  try {
    if (d.id) {
      await update(d.id, { question: d.question.trim(), answer: d.answer.trim(), language: d.language.trim() || 'en' })
    } else {
      await create({ question: d.question.trim(), answer: d.answer.trim(), language: d.language.trim() || 'en' })
    }
    toast.add({ title: 'Saved', color: 'success' })
    selected.value = null
  } catch {
    toast.add({ title: 'Could not save', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function toggleArchive(entry: InboxKnowledgeEntry) {
  try {
    await update(entry.id, { status: entry.status === 'archived' ? 'active' : 'archived' })
  } catch {
    toast.add({ title: 'Could not update', color: 'error' })
  }
}

async function del(entry: InboxKnowledgeEntry) {
  try {
    await remove(entry.id)
    if (selected.value?.id === entry.id) selected.value = null
    toast.add({ title: 'Deleted', color: 'success' })
  } catch {
    toast.add({ title: 'Could not delete', color: 'error' })
  }
}

async function doRefreshGrounding() {
  refreshing.value = true
  try {
    const r = await refreshGrounding()
    toast.add({
      title: r.failed.length
        ? `Grounding refreshed — ${r.synced.length} ok, ${r.failed.length} failed`
        : `Grounding refreshed — ${r.synced.length} page(s)`,
      // Name the pages that failed so the admin knows which URLs to fix.
      description: r.failed.length ? r.failed.map(f => f.url).join('\n') : undefined,
      color: r.failed.length ? 'warning' : 'success'
    })
  } catch {
    toast.add({ title: 'Grounding refresh failed', color: 'error' })
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Knowledge base"
    description="Anonymised Q&A the AI drafter references. Grounding syncs your configured source pages."
    :ui="{ content: 'max-w-4xl' }"
  >
    <template #body>
      <div class="flex items-center justify-between gap-2 mb-3">
        <USelect
          v-model="statusFilter"
          :items="STATUS_ITEMS"
          value-key="value"
          size="sm"
          class="w-36"
        />
        <div class="flex items-center gap-2">
          <UButton
            v-if="canManage"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            size="sm"
            :loading="refreshing"
            @click="doRefreshGrounding"
          >
            Refresh grounding
          </UButton>
          <UButton
            v-if="canManage"
            icon="i-lucide-plus"
            size="sm"
            @click="newEntry"
          >
            New entry
          </UButton>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 min-h-80">
        <!-- List -->
        <div class="border border-(--ui-border) rounded-md divide-y divide-(--ui-border) overflow-y-auto max-h-96">
          <div
            v-if="loaded && !items.length"
            class="p-4 text-sm text-(--ui-text-muted)"
          >
            No entries yet. Capture one from a resolved conversation.
          </div>
          <button
            v-for="entry in items"
            :key="entry.id"
            type="button"
            class="w-full text-left p-3 hover:bg-(--ui-bg-muted) focus:bg-(--ui-bg-muted)"
            :class="selected?.id === entry.id ? 'bg-(--ui-bg-muted)' : ''"
            @click="edit(entry)"
          >
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium truncate flex-1">{{ entry.question }}</span>
              <UBadge
                v-if="entry.status === 'archived'"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                Archived
              </UBadge>
            </div>
            <div class="text-xs text-(--ui-text-muted) truncate">
              {{ entry.answer }}
            </div>
            <div
              v-if="canManage"
              class="flex gap-1 mt-1"
            >
              <UButton
                :icon="entry.status === 'archived' ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
                color="neutral"
                variant="ghost"
                size="xs"
                @click.stop="toggleArchive(entry)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="xs"
                @click.stop="del(entry)"
              />
            </div>
          </button>
        </div>

        <!-- Editor -->
        <div>
          <div
            v-if="!selected"
            class="h-full flex items-center justify-center text-sm text-(--ui-text-muted)"
          >
            Select an entry to edit{{ canManage ? ', or add a new one' : '' }}.
          </div>
          <div
            v-else
            class="space-y-3"
          >
            <UFormField label="Question">
              <UTextarea
                v-model="selected.question"
                :rows="2"
                :disabled="!canManage"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Answer">
              <UTextarea
                v-model="selected.answer"
                :rows="6"
                :disabled="!canManage"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Language">
              <UInput
                v-model="selected.language"
                :disabled="!canManage"
                class="w-32"
              />
            </UFormField>
            <div
              v-if="canManage"
              class="flex justify-end"
            >
              <UButton
                :disabled="!canSave"
                :loading="saving"
                icon="i-lucide-check"
                @click="save"
              >
                Save
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
