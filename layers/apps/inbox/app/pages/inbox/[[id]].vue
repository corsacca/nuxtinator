<script setup lang="ts">
// The shared inbox: rail (scope folders) · conversation list · thread.
// Selection rides the route (/inbox/:id) so threads are linkable; the org
// prefix on internal navigation is preserved by useInboxPath. All list state
// (scope/status/q) lives in the URL query.
import type { InboxTagColor } from '../../composables/useInboxTags'
import type { InboxAiMetadata } from '../../composables/useInboxThread'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const router = useRouter()
const inboxPath = useInboxPath()

const selectedId = computed(() => {
  const raw = route.params.id
  const id = Array.isArray(raw) ? raw[0] : raw
  return id || null
})

const { items, counts, tagCounts, pending, error, scope, status, q, tag, refresh } = useInboxConversations()
const { thread, error: threadError, refresh: refreshThread, patch, reply, saveDraft, deleteDraft, saveAiDraft, uploadAttachment, removeAttachment, uploadInlineImage, createContact } = useInboxThread(selectedId)
const { users: assignees } = useInboxAssignees()
const { palette, createTag, deleteTag, setConversationTags } = useInboxTags()
const { items: cannedItems, create: createCanned, update: updateCanned, remove: removeCanned } = useInboxCanned()
const { me, saveIdentity } = useInboxMe()
const { hasPermission } = usePermissions()
const { available: aiAvailable } = useInboxAiStatus('inbox.draft')

const toast = useToast()
const showCompose = ref(false)
const showCanned = ref(false)
const showIdentity = ref(false)
const showSuppressions = ref(false)
const showAiDraft = ref(false)
const showAddKb = ref(false)
const showKnowledge = ref(false)
const replying = ref(false)
const currentDraftId = ref<string | null>(null)
// Composer body + the loaded AI draft's reviewer pack (parent-owned so the AI
// modal can push a draft into the composer and surface its review panel).
const replyBody = ref('')
const aiMeta = ref<InboxAiMetadata | null>(null)

// The canned-response manager is a compose/reply-authority tool.
const canManageCanned = computed(() => hasPermission('inbox.send'))

// The middle-pane heading follows the active folder: a tag name when one is
// selected, otherwise the scope.
const viewLabel = computed(() => {
  if (tag.value) return palette.value.find(t => t.slug === tag.value)?.name ?? tag.value
  return scope.value === 'held' ? 'Needs review' : scope.value
})

function open(id: string) {
  router.push(withQuery(inboxPath(`/inbox/${id}`)))
}

function withQuery(path: string) {
  return { path, query: route.query }
}

async function onPatch(body: { status?: string, assignedUserId?: string | null, needsReview?: boolean }) {
  const wasSpam = thread.value?.conversation.status === 'spam'
  try {
    await patch(body)
    await refresh()
    if (body.status === 'spam') {
      toast.add({ title: 'Marked as spam', icon: 'i-lucide-shield-ban', color: 'success' })
    } else if (wasSpam && body.status) {
      toast.add({ title: 'Removed from spam', icon: 'i-lucide-shield-check', color: 'success' })
    }
  } catch (err) {
    toast.add({ title: 'Update failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  }
}

async function onReply(body: string, draftId?: string, fromIdentity?: 'personal' | 'contact') {
  replying.value = true
  try {
    await reply(body, draftId, fromIdentity)
    await refresh()
    toast.add({ title: 'Reply queued', icon: 'i-lucide-send', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Reply failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  } finally {
    replying.value = false
  }
}

async function onSaveDraft(body: string) {
  try {
    const newId = await saveDraft(body, currentDraftId.value ?? undefined)
    if (newId) currentDraftId.value = newId
    toast.add({ title: 'Draft saved', icon: 'i-lucide-save', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Save failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  }
}

async function onDeleteDraft(draftId: string) {
  try {
    await deleteDraft(draftId)
  } catch (err) {
    toast.add({ title: 'Discard failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  }
}

async function onAttachFiles(files: File[], body: string) {
  try {
    // Attachments need a draft to bind to — create one from the current body
    // if the composer isn't already editing a draft.
    let draftId = currentDraftId.value
    if (!draftId) {
      draftId = (await saveDraft(body)) ?? null
      currentDraftId.value = draftId
    }
    if (!draftId) return
    for (const f of files) await uploadAttachment(draftId, f)
  } catch (err) {
    toast.add({ title: 'Attachment failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  }
}

async function onRemoveAttachment(attachmentId: string) {
  try {
    await removeAttachment(attachmentId)
  } catch (err) {
    toast.add({ title: 'Remove failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
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

// Tag mutations refresh both panes: the thread (its chips/picker state) and the
// list (row chips + rail tag counts change server-side).
async function onSetTags(slugs: string[]) {
  const id = selectedId.value
  if (!id) return
  try {
    await setConversationTags(id, slugs)
    await Promise.all([refreshThread(), refresh()])
  } catch (err) {
    toast.add({ title: 'Tagging failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  }
}

async function onCreateTag(name: string, color: InboxTagColor) {
  const id = selectedId.value
  if (!id) return
  try {
    // Create-or-return, then assign to the open conversation in one step.
    const created = await createTag(name, color)
    const next = [...(thread.value?.conversation.tags ?? []), created.slug]
    await setConversationTags(id, next)
    await Promise.all([refreshThread(), refresh()])
  } catch (err) {
    toast.add({ title: 'Create tag failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  }
}

async function onDeleteTag(slug: string) {
  try {
    // Server strips the slug from every conversation; refresh both panes so no
    // ghost chips linger, and drop the tag filter if it was the active folder.
    await deleteTag(slug)
    if (tag.value === slug) tag.value = ''
    await Promise.all([refreshThread(), refresh()])
  } catch (err) {
    toast.add({ title: 'Delete tag failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  }
}

async function onCreateCanned(title: string, bodyHtml: string) {
  try {
    await createCanned(title, bodyHtml)
    toast.add({ title: 'Canned response saved', icon: 'i-lucide-save', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Save failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  }
}

async function onUpdateCanned(id: string, title: string, bodyHtml: string) {
  try {
    await updateCanned(id, { title, bodyHtml })
    toast.add({ title: 'Canned response updated', icon: 'i-lucide-save', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Update failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  }
}

async function onDeleteCanned(id: string) {
  try {
    await removeCanned(id)
    toast.add({ title: 'Canned response deleted', icon: 'i-lucide-trash-2', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Delete failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  }
}

// The AI modal generated a draft the reviewer chose; persist it as a shared
// ai_generated draft, load it into the composer, and surface its review panel.
async function onUseAiDraft({ html, text, meta }: { html: string, text: string, meta: InboxAiMetadata }) {
  try {
    const draftId = await saveAiDraft({ html, text, meta })
    currentDraftId.value = draftId ?? null
    replyBody.value = html
    aiMeta.value = meta
    await refresh()
    toast.add({ title: 'AI draft ready to review', icon: 'i-lucide-sparkles', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Could not save AI draft', description: err instanceof Error ? err.message : undefined, color: 'error' })
  }
}

async function onSaveIdentity(patch: { alias?: string | null, signature?: string | null }) {
  try {
    await saveIdentity(patch)
    toast.add({ title: 'Identity saved', icon: 'i-lucide-save', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Save failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  }
}
</script>

<template>
  <div class="flex h-[calc(100vh-57px)] -mx-4 sm:-mx-6 lg:-mx-8 -my-6 lg:-my-8">
    <InboxRail v-model:scope="scope" v-model:tag="tag" :counts="counts" :tags="palette" :tag-counts="tagCounts" />

    <section class="flex-1 flex min-w-0 overflow-hidden">
      <div class="flex flex-col min-h-0" :class="selectedId ? 'hidden lg:flex' : 'flex w-full lg:w-auto'">
        <div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-(--ui-border)">
          <span class="text-sm font-medium text-(--ui-text-muted) capitalize">{{ viewLabel }}</span>
          <div class="flex items-center gap-1.5">
            <UButton
              v-if="me"
              label="Identity"
              icon="i-lucide-signature"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="showIdentity = true"
            />
            <UButton
              v-if="canManageCanned"
              label="Canned"
              icon="i-lucide-message-square-text"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="showCanned = true"
            />
            <UButton
              v-if="canManageCanned"
              label="Suppressions"
              icon="i-lucide-mail-x"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="showSuppressions = true"
            />
            <UButton
              v-if="aiAvailable"
              label="Knowledge"
              icon="i-lucide-book-open"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="showKnowledge = true"
            />
            <UButton label="New email" icon="i-lucide-pen-line" size="xs" @click="showCompose = true" />
          </div>
        </div>
        <InboxConversationList
          v-model:status="status"
          v-model:q="q"
          :items="items"
          :counts="counts"
          :pending="pending"
          :scope="scope"
          :selected-id="selectedId"
          :palette="palette"
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
          v-model:draft-id="currentDraftId"
          v-model:reply-body="replyBody"
          :thread="thread"
          :assignees="assignees"
          :palette="palette"
          :canned="cannedItems"
          :me="me"
          :sending="replying"
          :upload-inline-image="uploadInlineImage"
          :ai-available="aiAvailable"
          :ai-meta="aiMeta"
          @patch="onPatch"
          @reply="onReply"
          @save-draft="onSaveDraft"
          @delete-draft="onDeleteDraft"
          @attach-files="onAttachFiles"
          @remove-attachment="onRemoveAttachment"
          @create-contact="onCreateContact"
          @set-tags="onSetTags"
          @create-tag="onCreateTag"
          @delete-tag="onDeleteTag"
          @ai-draft="showAiDraft = true"
          @add-knowledge="showAddKb = true"
          @dismiss-ai-meta="aiMeta = null"
          @load-draft-meta="aiMeta = $event"
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

    <InboxCannedManager
      v-if="canManageCanned"
      v-model:open="showCanned"
      :items="cannedItems"
      @create="onCreateCanned"
      @update="onUpdateCanned"
      @delete="onDeleteCanned"
    />

    <InboxIdentityModal v-if="me" v-model:open="showIdentity" :me="me" @save="onSaveIdentity" />

    <InboxSuppressionsModal
      v-if="canManageCanned"
      v-model:open="showSuppressions"
      :can-clear="me?.canManageAliases ?? false"
    />

    <InboxAiDraftModal
      v-if="thread"
      v-model:open="showAiDraft"
      :conversation-id="thread.conversation.id"
      @use="onUseAiDraft"
    />

    <InboxAddToKnowledgeBaseModal
      v-if="thread"
      v-model:open="showAddKb"
      :conversation-id="thread.conversation.id"
    />

    <InboxKnowledgeManager
      v-model:open="showKnowledge"
      :can-manage="canManageCanned"
    />
  </div>
</template>
