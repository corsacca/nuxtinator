<script setup lang="ts">
// The shared inbox: rail (scope folders) · conversation list · thread.
// Selection rides the route (/inbox/:id) so threads are linkable; the org
// prefix on internal navigation is preserved by useInboxPath. All list state
// (scope/status/q) lives in the URL query.
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const router = useRouter()
const inboxPath = useInboxPath()

const selectedId = computed(() => {
  const raw = route.params.id
  const id = Array.isArray(raw) ? raw[0] : raw
  return id || null
})

const { items, counts, pending, error, scope, status, q, refresh } = useInboxConversations()
const { thread, error: threadError, patch, reply, createContact } = useInboxThread(selectedId)
const { users: assignees } = useInboxAssignees()

const toast = useToast()
const showCompose = ref(false)

function open(id: string) {
  router.push(withQuery(inboxPath(`/inbox/${id}`)))
}

function withQuery(path: string) {
  return { path, query: route.query }
}

async function onPatch(body: { status?: string, assignedUserId?: string | null, needsReview?: boolean }) {
  try {
    await patch(body)
    await refresh()
  } catch (err) {
    toast.add({ title: 'Update failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  }
}

async function onReply(body: string) {
  try {
    await reply(body)
    await refresh()
    toast.add({ title: 'Reply queued', icon: 'i-lucide-send', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Reply failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  }
}

async function onCreateContact(name: string) {
  try {
    await createContact(name)
    toast.add({ title: 'Contact created', icon: 'i-lucide-user-plus', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Contact creation failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  }
}
</script>

<template>
  <div class="flex h-[calc(100vh-57px)] -mx-4 sm:-mx-6 lg:-mx-8 -my-6 lg:-my-8">
    <InboxRail v-model:scope="scope" :counts="counts" />

    <section class="flex-1 flex min-w-0 overflow-hidden">
      <div class="flex flex-col min-h-0" :class="selectedId ? 'hidden lg:flex' : 'flex w-full lg:w-auto'">
        <div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-(--ui-border)">
          <span class="text-sm font-medium text-(--ui-text-muted) capitalize">{{ scope === 'held' ? 'Needs review' : scope }}</span>
          <UButton label="New email" icon="i-lucide-pen-line" size="xs" @click="showCompose = true" />
        </div>
        <InboxConversationList
          v-model:status="status"
          v-model:q="q"
          :items="items"
          :counts="counts"
          :pending="pending"
          :scope="scope"
          :selected-id="selectedId"
          class="flex-1 min-h-0"
          @select="open"
        />
      </div>

      <template v-if="selectedId">
        <div class="lg:hidden absolute top-2 left-2 z-10">
          <UButton icon="i-lucide-arrow-left" variant="ghost" color="neutral" size="sm" :to="withQuery(inboxPath('/inbox'))" />
        </div>
        <InboxThread
          v-if="thread"
          :thread="thread"
          :assignees="assignees"
          @patch="onPatch"
          @reply="onReply"
          @create-contact="onCreateContact"
        />
        <UEmpty
          v-else-if="threadError"
          icon="i-lucide-alert-triangle"
          title="Conversation unavailable"
          :description="threadError"
          variant="naked"
          class="m-auto"
        />
      </template>
      <UEmpty
        v-else
        icon="i-lucide-mails"
        title="Select a conversation"
        description="Pick a conversation from the list, or start a new email."
        variant="naked"
        class="m-auto hidden lg:flex"
      />
    </section>

    <UAlert v-if="error" color="error" variant="subtle" :title="error" class="absolute bottom-4 right-4 w-80" />

    <InboxComposeModal v-model:open="showCompose" @created="open" />
  </div>
</template>
