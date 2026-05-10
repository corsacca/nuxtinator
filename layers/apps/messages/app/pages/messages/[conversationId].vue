<script setup lang="ts">
import type { MessageItem } from '../../composables/useConversationItems'

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const conversationId = computed<string | null>(() => {
  const id = route.params.conversationId
  return Array.isArray(id) ? (id[0] ?? null) : (id ?? null)
})

const { items, pending, error, postMarkdown, postUpload, start, stop, refresh } = useConversationItems(conversationId)

onMounted(start)
onBeforeUnmount(stop)

const modalItemId = ref<string | null>(null)
const modalOpen = ref(false)
// Track the modal item by id so any refresh of `items` reactively updates
// what the modal renders (e.g. after the user saves an edit).
const modalItem = computed<MessageItem | null>(() => {
  if (!modalItemId.value) return null
  return items.value.find(i => i.id === modalItemId.value) ?? null
})

function openItem(item: MessageItem) {
  modalItemId.value = item.id
  modalOpen.value = true
}
function openItemById(id: string) {
  modalItemId.value = id
  modalOpen.value = true
}
function onModalSaved() {
  refresh()
}

async function onSubmit(bodyMd: string) {
  try {
    await postMarkdown(bodyMd)
  } catch (e) {
    console.error('Failed to post item:', e)
  }
}

async function onUploaded(payload: { kind: 'image' | 'file', upload: { storage_key: string, filename: string, mime: string, size_bytes: number } }) {
  try {
    await postUpload(payload.upload, payload.kind)
  } catch (e) {
    console.error('Failed to post upload:', e)
  }
}

async function toggleStar(itemId: string, starred: boolean) {
  try {
    await $fetch(`/api/messages/items/${itemId}/star`, {
      method: starred ? 'POST' : 'DELETE'
    })
    refresh()
  } catch (e) {
    console.error(e)
  }
}

async function toggleReaction(itemId: string, emoji: string, mine: boolean) {
  try {
    await $fetch('/api/messages/reactions', {
      method: mine ? 'DELETE' : 'POST',
      body: { target_kind: 'item', target_id: itemId, emoji }
    })
    refresh()
  } catch (e) {
    console.error(e)
  }
}

const sidebarOpen = ref(false)
</script>

<template>
  <div class="flex h-[calc(100vh-57px)] lg:h-[calc(100vh-57px)] -mx-4 sm:-mx-6 lg:-mx-8 -my-6 lg:-my-8">
    <MessagesSidebar v-model:open="sidebarOpen" />

    <section class="flex-1 flex flex-col min-w-0 border-l-0 lg:border-l border-(--ui-border) overflow-hidden">
      <header class="flex items-center gap-2 px-3 py-2 border-b border-(--ui-border) bg-(--ui-bg)">
        <UButton
          class="lg:hidden"
          icon="i-lucide-menu"
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Open conversations"
          @click="sidebarOpen = true"
        />
        <div class="flex-1" />
        <MessagesSearchBar />
        <MessagesNotificationBell />
      </header>

      <div v-if="!conversationId" class="flex-1 grid place-items-center text-(--ui-text-muted)">
        <div class="text-center max-w-sm">
          <UIcon name="i-lucide-message-square" class="size-10 mb-3 opacity-50" />
          <p class="text-sm">
            Pick a channel or DM from the sidebar — or create one.
          </p>
        </div>
      </div>

      <template v-else>
        <div class="flex-1 overflow-y-auto p-4 flex flex-col-reverse">
          <div v-if="pending && items.length === 0" class="text-center text-sm text-(--ui-text-muted) py-8">
            Loading...
          </div>
          <div v-else-if="error" class="text-center text-sm text-(--ui-error) py-8">
            {{ error }}
          </div>
          <div v-else-if="items.length === 0" class="flex-1 grid place-items-center text-(--ui-text-muted)">
            <div class="text-center max-w-sm">
              <UIcon name="i-lucide-pencil" class="size-8 mb-2 opacity-50" />
              <p class="text-sm">
                No messages yet. Be the first to post.
              </p>
            </div>
          </div>
          <div v-else class="flex flex-col-reverse gap-1">
            <MessagesItemCard
              v-for="it in items"
              :key="it.id"
              :item="it"
              @toggle-star="toggleStar"
              @toggle-reaction="toggleReaction"
              @open-comments="openItemById"
              @tags-changed="refresh"
              @click="openItem(it)"
            />
          </div>
        </div>

        <div class="p-3 border-t border-(--ui-border) bg-(--ui-bg) flex items-end gap-2">
          <div class="flex-1 min-w-0">
            <MessagesComposer @submit="onSubmit" />
          </div>
          <MessagesUploadButton @uploaded="onUploaded" />
        </div>
      </template>
    </section>

    <MessagesItemModal
      v-model:open="modalOpen"
      :item="modalItem"
      @saved="onModalSaved"
    />
  </div>
</template>
