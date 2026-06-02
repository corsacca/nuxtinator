<script setup lang="ts">
import type { FilesItemDetail, FilesVersion } from '../../composables/useFiles'

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const toast = useToast()
const id = computed(() => route.params.id as string)

const {
  get, update, remove, listVersions, restoreVersion, issueLink, revokeLink, publicUrl
} = useFiles()

const item = ref<FilesItemDetail | null>(null)
const loading = ref(true)
const notFound = ref(false)

// Doc working copy. Docs open in edit mode by default; `editing` toggles
// between the split editor and a full-width rendered display.
const editing = ref(false)
const editTitle = ref('')
const editBody = ref('')
const saving = ref(false)

const docEditing = computed(() => item.value?.kind === 'doc' && editing.value)

async function load() {
  loading.value = true
  notFound.value = false
  try {
    item.value = await get(id.value)
    if (item.value.kind === 'doc') {
      editTitle.value = item.value.title
      editBody.value = item.value.body_md ?? ''
    }
  } catch {
    notFound.value = true
  } finally {
    loading.value = false
  }
}

async function saveEdit() {
  if (!editTitle.value.trim()) {
    toast.add({ title: 'Title is required', color: 'error' })
    return
  }
  saving.value = true
  try {
    await update(id.value, { title: editTitle.value.trim(), body_md: editBody.value })
    await load()
    toast.add({ title: 'Saved', color: 'success' })
  } finally {
    saving.value = false
  }
}

// ── Versions ─────────────────────────────────────────────────────────────
const versionsOpen = ref(false)
const versions = ref<FilesVersion[]>([])
const restoring = ref(false)

async function openVersions() {
  versions.value = await listVersions(id.value)
  versionsOpen.value = true
}

async function onRestore(versionId: string) {
  restoring.value = true
  try {
    await restoreVersion(id.value, versionId)
    versions.value = await listVersions(id.value)
    await load()
    toast.add({ title: 'Version restored', color: 'success' })
  } finally {
    restoring.value = false
  }
}

// ── Details (title + tags) ───────────────────────────────────────────────
const detailsOpen = ref(false)
const detailsTitle = ref('')
const detailsTags = ref<string[]>([])
const savingDetails = ref(false)

function openDetails() {
  if (!item.value) return
  detailsTitle.value = item.value.title
  detailsTags.value = [...item.value.tags]
  detailsOpen.value = true
}

async function saveDetails() {
  savingDetails.value = true
  try {
    await update(id.value, { title: detailsTitle.value.trim(), tags: detailsTags.value })
    detailsOpen.value = false
    await load()
  } finally {
    savingDetails.value = false
  }
}

// ── Share ────────────────────────────────────────────────────────────────
const sharing = ref(false)

async function onShare() {
  sharing.value = true
  try {
    await issueLink(id.value)
    await load()
    toast.add({ title: 'Share link created', color: 'success' })
  } finally {
    sharing.value = false
  }
}

async function onRevoke() {
  sharing.value = true
  try {
    await revokeLink(id.value)
    await load()
    toast.add({ title: 'Share link revoked', color: 'neutral' })
  } finally {
    sharing.value = false
  }
}

async function copyLink() {
  if (!item.value?.share_token) return
  const url = publicUrl(item.value.share_token)
  try {
    await navigator.clipboard.writeText(url)
    toast.add({ title: 'Link copied', color: 'success' })
  } catch {
    toast.add({ title: url, color: 'neutral' })
  }
}

// ── Delete ───────────────────────────────────────────────────────────────
const deleteOpen = ref(false)
const deleting = ref(false)

async function onDelete() {
  deleting.value = true
  try {
    await remove(id.value)
    await navigateTo('/files')
  } finally {
    deleting.value = false
    deleteOpen.value = false
  }
}

onMounted(async () => {
  await load()
  // Docs open straight into edit mode.
  if (item.value?.kind === 'doc') editing.value = true
})
</script>

<template>
  <div
    class="flex flex-col w-full"
    :class="docEditing ? '' : 'max-w-5xl mx-auto'"
  >
    <div v-if="loading" class="text-center py-16 text-(--ui-text-muted)">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
    </div>

    <UEmpty
      v-else-if="notFound || !item"
      icon="i-lucide-file-x"
      title="Not found"
      description="This file may have been deleted."
      :actions="[{ label: 'Back to files', to: '/files', icon: 'i-lucide-arrow-left' }]"
    />

    <template v-else>
      <!-- Header -->
      <div class="flex items-center gap-2 mb-4">
        <UButton
          to="/files"
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
          aria-label="Back to files"
        />
        <UInput
          v-if="docEditing"
          v-model="editTitle"
          placeholder="Untitled document"
          size="lg"
          class="flex-1"
          :ui="{ base: 'font-semibold' }"
        />
        <h1 v-else class="text-xl font-semibold flex-1 truncate">
          {{ item.kind === 'doc' ? editTitle : item.title }}
        </h1>

        <!-- Doc mode controls -->
        <template v-if="item.kind === 'doc'">
          <UButton v-if="editing" icon="i-lucide-check" :loading="saving" @click="saveEdit">
            Save
          </UButton>
          <UButton
            v-if="editing"
            icon="i-lucide-eye"
            variant="outline"
            color="neutral"
            @click="editing = false"
          >
            Display
          </UButton>
          <UButton
            v-else
            icon="i-lucide-pencil"
            @click="editing = true"
          >
            Edit
          </UButton>
          <UButton
            icon="i-lucide-history"
            variant="outline"
            color="neutral"
            @click="openVersions"
          >
            Versions
          </UButton>
        </template>

        <!-- Always available -->
        <UButton
          icon="i-lucide-settings-2"
          variant="ghost"
          color="neutral"
          aria-label="Edit details"
          @click="openDetails"
        />
        <UButton
          icon="i-lucide-trash-2"
          variant="ghost"
          color="error"
          aria-label="Delete"
          @click="deleteOpen = true"
        />
      </div>

      <!-- Tags + share bar (visible in both view and edit modes) -->
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <UBadge
          v-for="t in item.tags"
          :key="t"
          :label="t"
          icon="i-lucide-tag"
          color="neutral"
          variant="soft"
        />
        <div class="flex-1" />
        <template v-if="item.share_token">
          <UButton size="sm" variant="soft" icon="i-lucide-link" @click="copyLink">
            Copy link
          </UButton>
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-lucide-link-2-off"
            :loading="sharing"
            @click="onRevoke"
          >
            Revoke
          </UButton>
        </template>
        <UButton
          v-else
          size="sm"
          variant="outline"
          color="neutral"
          icon="i-lucide-share-2"
          :loading="sharing"
          @click="onShare"
        >
          Share
        </UButton>
      </div>

      <!-- Body -->
      <div>
        <FilesDocEditor
          v-if="docEditing"
          v-model:body-md="editBody"
        />
        <div
          v-else-if="item.kind === 'doc'"
          class="rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated) p-6"
        >
          <FilesRenderer :body-md="editBody" />
        </div>
        <FilesFilePreview v-else :item="item" />
      </div>
    </template>

    <!-- Versions slideover -->
    <USlideover v-model:open="versionsOpen" title="Version history">
      <template #body>
        <FilesVersionHistory
          :versions="versions"
          :current-body="editBody"
          :restoring="restoring"
          @restore="onRestore"
        />
      </template>
    </USlideover>

    <!-- Details modal -->
    <UModal v-model:open="detailsOpen" title="Edit details">
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField label="Title">
            <UInput v-model="detailsTitle" class="w-full" />
          </UFormField>
          <UFormField label="Tags" description="Press enter to add a tag.">
            <UInputTags v-model="detailsTags" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" color="neutral" @click="detailsOpen = false">Cancel</UButton>
          <UButton :loading="savingDetails" @click="saveDetails">Save</UButton>
        </div>
      </template>
    </UModal>

    <!-- Delete confirm -->
    <UModal v-model:open="deleteOpen" title="Delete this item?">
      <template #body>
        <p class="text-sm text-(--ui-text-muted)">
          This can't be undone{{ item?.kind === 'file' ? ' — the file will be removed from storage' : '' }}.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" color="neutral" @click="deleteOpen = false">Cancel</UButton>
          <UButton color="error" :loading="deleting" @click="onDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
