<script setup lang="ts">
// The "Notes & Activity" tab body: a note composer (plain text + a teammate
// mention picker) and the merged newest-first feed of internal notes and audit
// activity. Own notes are editable/removable inline; system notes and activity
// rows are read-only.
import type { InboxAssignee } from '../../composables/useInboxThread'
import type { InboxTimelineEntry } from '../../composables/useInboxNotesTimeline'

const props = defineProps<{ conversationId: string, users: InboxAssignee[] }>()

const { user } = useAuth()
const currentUserId = computed(() => (user.value as { id?: string } | null)?.id ?? null)
const toast = useToast()

const { entries, hasMore, pending, error, loadOlder, post, editNote, removeNote } = useInboxNotesTimeline(() => props.conversationId)

const noteBody = ref('')
const mentionIds = ref<string[]>([])
const posting = ref(false)

const mentionItems = computed(() => props.users.map(u => ({ label: u.displayName, value: u.id })))

async function submitNote() {
  const body = noteBody.value.trim()
  if (!body || posting.value) return
  posting.value = true
  try {
    await post(body, mentionIds.value)
    noteBody.value = ''
    mentionIds.value = []
  } catch (err) {
    toast.add({ title: 'Note failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  } finally {
    posting.value = false
  }
}

// Inline edit state (one note at a time).
const editingId = ref<string | null>(null)
const editBody = ref('')
function startEdit(id: string, body: string) {
  editingId.value = id
  editBody.value = body
}
async function saveEdit() {
  const id = editingId.value
  const body = editBody.value.trim()
  if (!id || !body) { editingId.value = null; return }
  try {
    await editNote(id, body)
  } catch (err) {
    toast.add({ title: 'Edit failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  } finally {
    editingId.value = null
  }
}
async function onRemove(id: string) {
  try {
    await removeNote(id)
  } catch (err) {
    toast.add({ title: 'Delete failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  }
}

const ACTIVITY_ICON: Record<string, string> = {
  inbox_conversation_created: 'i-lucide-sparkles',
  inbox_inbound_received: 'i-lucide-mail',
  inbox_reply_queued: 'i-lucide-send',
  inbox_status_changed: 'i-lucide-circle-dot',
  inbox_assigned: 'i-lucide-user-check',
  inbox_spam: 'i-lucide-shield-ban',
  inbox_tags_updated: 'i-lucide-tag'
}
function activityIcon(eventType: string): string {
  return ACTIVITY_ICON[eventType] ?? 'i-lucide-activity'
}
function isOwn(e: InboxTimelineEntry): boolean {
  return e.kind === 'note' && e.note.authorId !== null && e.note.authorId === currentUserId.value
}
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0">
    <div class="p-3 border-b border-(--ui-border) space-y-2">
      <UTextarea
        v-model="noteBody"
        :rows="2"
        autoresize
        placeholder="Add an internal note… (only staff see this)"
        class="w-full"
        @keydown.meta.enter="submitNote"
        @keydown.ctrl.enter="submitNote"
      />
      <div class="flex items-center gap-2">
        <USelectMenu
          v-model="mentionIds"
          :items="mentionItems"
          value-key="value"
          multiple
          placeholder="Notify teammates"
          icon="i-lucide-at-sign"
          size="xs"
          class="flex-1 min-w-0"
        />
        <UButton
          label="Add note"
          icon="i-lucide-message-square-plus"
          size="xs"
          :loading="posting"
          :disabled="!noteBody.trim()"
          @click="submitNote"
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-3 space-y-3">
      <UAlert v-if="error" color="error" variant="subtle" :title="error" />
      <div v-if="pending && !entries.length" class="grid place-items-center py-8 text-(--ui-text-muted)">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
      </div>
      <p v-else-if="!entries.length" class="text-sm text-(--ui-text-dimmed) text-center py-8">
        No notes or activity yet.
      </p>

      <template v-for="entry in entries" :key="entry.id">
        <div v-if="entry.kind === 'note'" class="flex gap-2">
          <UAvatar :alt="entry.note.authorName" size="xs" class="mt-0.5 shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 text-xs">
              <span class="font-medium text-(--ui-text-highlighted) truncate">{{ entry.note.authorName }}</span>
              <span class="text-(--ui-text-dimmed)">{{ inboxRelativeTime(entry.note.createdAt) }}</span>
              <span v-if="entry.note.editedAt" class="text-(--ui-text-dimmed)">(edited)</span>
              <template v-if="isOwn(entry) && editingId !== entry.note.id">
                <UButton icon="i-lucide-pencil" size="xs" variant="ghost" color="neutral" class="ml-auto" aria-label="Edit note" @click="startEdit(entry.note.id, entry.note.body)" />
                <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" aria-label="Delete note" @click="onRemove(entry.note.id)" />
              </template>
            </div>
            <template v-if="editingId === entry.note.id">
              <UTextarea v-model="editBody" :rows="2" autoresize class="w-full mt-1" @keydown.meta.enter="saveEdit" @keydown.ctrl.enter="saveEdit" @keydown.esc="editingId = null" />
              <div class="flex justify-end gap-2 mt-1">
                <UButton label="Cancel" size="xs" variant="ghost" color="neutral" @click="editingId = null" />
                <UButton label="Save" size="xs" @click="saveEdit" />
              </div>
            </template>
            <p v-else class="text-sm text-(--ui-text-toned) whitespace-pre-wrap break-words mt-0.5">{{ entry.note.body }}</p>
          </div>
        </div>

        <div v-else class="flex items-center gap-2 text-xs text-(--ui-text-muted) pl-1">
          <UIcon :name="activityIcon(entry.activity.eventType)" class="size-3.5 shrink-0 text-(--ui-text-dimmed)" />
          <span class="truncate">{{ entry.activity.message || entry.activity.eventType }}</span>
          <span v-if="entry.activity.actorName" class="text-(--ui-text-dimmed) shrink-0">· {{ entry.activity.actorName }}</span>
          <span class="text-(--ui-text-dimmed) shrink-0 ml-auto">{{ inboxRelativeTime(typeof entry.activity.at === 'number' ? new Date(entry.activity.at).toISOString() : entry.activity.at) }}</span>
        </div>
      </template>

      <div v-if="hasMore" class="text-center pt-1">
        <UButton label="Load older" size="xs" variant="ghost" color="neutral" @click="loadOlder" />
      </div>
    </div>
  </div>
</template>
