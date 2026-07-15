<script setup lang="ts">
// Two-pane manager for canned responses: the snippet list on the left, an
// editor on the right. Single body field (no language select — i18n is
// deferred to core). The parent owns persistence and the `items` list; this
// component emits intent and reflects the refreshed list back through the prop.
import type { InboxCannedResponse } from '../../composables/useInboxCanned'

const props = defineProps<{ items: InboxCannedResponse[] }>()
const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  create: [title: string, bodyHtml: string]
  update: [id: string, title: string, bodyHtml: string]
  delete: [id: string]
}>()

const editingId = ref<string | null>(null)
const isNew = ref(false)
const title = ref('')
const body = ref('')

const active = computed(() => editingId.value !== null || isNew.value)

function selectItem(item: InboxCannedResponse) {
  editingId.value = item.id
  isNew.value = false
  title.value = item.title
  body.value = item.bodyHtml
}

function startNew() {
  editingId.value = null
  isNew.value = true
  title.value = ''
  body.value = ''
}

function clearSelection() {
  editingId.value = null
  isNew.value = false
  title.value = ''
  body.value = ''
}

function save() {
  const t = title.value.trim()
  if (!t) return
  if (isNew.value) {
    emit('create', t, body.value)
    clearSelection()
  } else if (editingId.value) {
    emit('update', editingId.value, t, body.value)
  }
}

function remove() {
  if (editingId.value) {
    emit('delete', editingId.value)
    clearSelection()
  }
}

// Start each open on the list view.
watch(open, (v) => { if (v) clearSelection() })
</script>

<template>
  <UModal v-model:open="open" title="Canned responses" :ui="{ content: 'max-w-3xl' }">
    <template #body>
      <div class="flex gap-3 h-96 min-h-0">
        <div class="w-56 shrink-0 flex flex-col min-h-0 border-r border-(--ui-border) pr-3">
          <UButton
            label="New response"
            icon="i-lucide-plus"
            size="xs"
            variant="subtle"
            color="neutral"
            class="mb-2 justify-center"
            @click="startNew"
          />
          <div class="flex-1 overflow-y-auto space-y-0.5">
            <button
              v-for="item in items"
              :key="item.id"
              type="button"
              class="w-full text-left px-2 py-1.5 rounded-md text-sm truncate transition-colors"
              :class="editingId === item.id
                ? 'bg-(--ui-bg-accented) text-(--ui-text-highlighted)'
                : 'text-(--ui-text-muted) hover:bg-(--ui-bg-accented)/50'"
              @click="selectItem(item)"
            >
              {{ item.title }}
            </button>
            <p v-if="!items.length" class="px-2 py-2 text-xs text-(--ui-text-dimmed)">
              No canned responses yet.
            </p>
          </div>
        </div>

        <div class="flex-1 min-w-0 flex flex-col min-h-0">
          <template v-if="active">
            <UFormField label="Title" required class="mb-2">
              <UInput v-model="title" placeholder="Snippet title" class="w-full" />
            </UFormField>
            <UFormField label="Body" class="flex-1 min-h-0 flex flex-col">
              <UEditor
                v-model="body"
                content-type="html"
                placeholder="Snippet content…"
                :image="false"
                :mention="false"
                class="flex-1 min-h-32 overflow-y-auto rounded-md border border-(--ui-border)"
              />
            </UFormField>
            <div class="flex items-center justify-between gap-2 mt-2">
              <UButton
                v-if="editingId"
                label="Delete"
                icon="i-lucide-trash-2"
                size="sm"
                color="error"
                variant="ghost"
                @click="remove"
              />
              <div class="flex items-center gap-2 ml-auto">
                <UButton label="Cancel" size="sm" color="neutral" variant="ghost" @click="clearSelection" />
                <UButton :label="isNew ? 'Create' : 'Save'" icon="i-lucide-save" size="sm" :disabled="!title.trim()" @click="save" />
              </div>
            </div>
          </template>
          <div v-else class="m-auto text-center text-sm text-(--ui-text-dimmed)">
            <UIcon name="i-lucide-message-square-text" class="size-8 mx-auto mb-2 opacity-50" />
            <p>Select a response to edit, or create a new one.</p>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
