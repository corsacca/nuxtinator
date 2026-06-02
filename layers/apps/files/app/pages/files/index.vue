<script setup lang="ts">
import type { FilesItemSummary } from '../../composables/useFiles'

// List rows are plain summaries; search rows additionally carry a `headline`
// snippet (server-escaped — only <b> markers — so v-html is safe).
type FilesRow = FilesItemSummary & { headline?: string }

definePageMeta({
  middleware: 'auth'
})

const { list, createDoc, search: searchApi } = useFiles()
const toast = useToast()

// Pull a human message out of an $fetch/h3 error (body statusMessage first).
function errMsg(e: unknown): string {
  const err = e as { statusMessage?: string, data?: { statusMessage?: string, message?: string }, message?: string }
  return err?.data?.statusMessage || err?.statusMessage || err?.data?.message || err?.message || 'Something went wrong.'
}

const items = ref<FilesRow[]>([])
const loading = ref(true)
const activeTag = ref<string | null>(null)

const q = ref('')
const searchResults = ref<FilesRow[] | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null

async function load() {
  loading.value = true
  try {
    items.value = await list(activeTag.value ?? undefined)
  } finally {
    loading.value = false
  }
}

const allTags = computed(() => {
  const set = new Set<string>()
  for (const it of items.value) for (const t of it.tags) set.add(t)
  return [...set].sort()
})

const displayed = computed(() => searchResults.value ?? items.value)

watch(q, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  const term = val.trim()
  if (term.length < 2) {
    searchResults.value = null
    return
  }
  searchTimer = setTimeout(async () => {
    searchResults.value = await searchApi(term)
  }, 250)
})

watch(activeTag, load)

// New document modal
const newDocOpen = ref(false)
const newTitle = ref('')
const creating = ref(false)

async function createNewDoc() {
  const title = newTitle.value.trim() || 'Untitled document'
  creating.value = true
  try {
    const res = await createDoc({ title })
    newDocOpen.value = false
    newTitle.value = ''
    await navigateTo(`/files/${res.item.id}`)
  } catch (e) {
    toast.add({ title: errMsg(e), color: 'error' })
  } finally {
    creating.value = false
  }
}

// Upload — UFileUpload feeds dropped/picked files here; we upload each one
// (the endpoint takes one file per request) and clear the model when done.
const dropFiles = ref<File[] | null>(null)
const uploading = ref(false)

// Markdown files are imported as editable docs rather than stored uploads.
function isMarkdown(file: File): boolean {
  return /\.(md|markdown)$/i.test(file.name) || file.type === 'text/markdown'
}

async function uploadFiles(files: File[]) {
  uploading.value = true
  let ok = 0
  let lastDocId: string | null = null
  try {
    for (const file of files) {
      try {
        if (isMarkdown(file)) {
          const body_md = await file.text()
          const title = file.name.replace(/\.(md|markdown)$/i, '') || file.name
          const res = await createDoc({ title, body_md })
          lastDocId = res.item.id
        } else {
          const fd = new FormData()
          fd.append('file', file)
          await $fetch('/api/files/uploads', { method: 'POST', body: fd })
        }
        ok++
      } catch (e) {
        toast.add({ title: `${file.name}: ${errMsg(e)}`, color: 'error' })
      }
    }
    // A lone markdown drop lands straight in the editor.
    if (ok === 1 && files.length === 1 && lastDocId) {
      await navigateTo(`/files/${lastDocId}`)
      return
    }
    if (ok > 0) {
      await load()
      toast.add({ title: ok === 1 ? 'Added' : `${ok} files added`, color: 'success' })
    }
  } finally {
    uploading.value = false
  }
}

watch(dropFiles, async (files) => {
  const list = Array.isArray(files) ? files : files ? [files] : []
  if (!list.length) return
  await uploadFiles(list)
  dropFiles.value = null
})

function fmtDate(ts: string): string {
  return new Date(ts).toLocaleDateString()
}

onMounted(load)
</script>

<template>
  <div class="max-w-6xl mx-auto">
    <div class="flex flex-wrap items-center gap-3 mb-6">
      <h1 class="text-2xl font-semibold flex-1">Files</h1>
      <UInput
        v-model="q"
        icon="i-lucide-search"
        placeholder="Search files…"
        class="w-full sm:w-64"
      />
      <UButton icon="i-lucide-file-plus" @click="newDocOpen = true">
        New document
      </UButton>
    </div>

    <!-- Tag filter -->
    <div v-if="allTags.length" class="flex flex-wrap items-center gap-2 mb-4">
      <UButton
        size="xs"
        :variant="activeTag === null ? 'solid' : 'soft'"
        color="neutral"
        @click="activeTag = null"
      >
        All
      </UButton>
      <UButton
        v-for="t in allTags"
        :key="t"
        size="xs"
        :variant="activeTag === t ? 'solid' : 'soft'"
        color="neutral"
        icon="i-lucide-tag"
        @click="activeTag = t"
      >
        {{ t }}
      </UButton>
    </div>

    <!-- Drag-and-drop upload -->
    <UFileUpload
      v-model="dropFiles"
      multiple
      variant="area"
      icon="i-lucide-upload"
      label="Drop files here or click to upload"
      description="Up to 50 MB each"
      :preview="false"
      :disabled="uploading"
      class="mb-6 w-full"
    />

    <!-- Loading -->
    <div v-if="loading" class="text-center py-16 text-(--ui-text-muted)">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
    </div>

    <!-- Empty state -->
    <UEmpty
      v-else-if="displayed.length === 0"
      icon="i-lucide-folder-open"
      :title="searchResults ? 'No matches' : 'No files yet'"
      :description="searchResults
        ? 'Try a different search term.'
        : 'Create a document or upload a file to get started.'"
    />

    <!-- Grid -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <NuxtLink
        v-for="item in displayed"
        :key="item.id"
        :to="`/files/${item.id}`"
        class="group flex flex-col gap-2 rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated) p-4 hover:border-(--ui-border-accented) transition-colors"
      >
        <div class="flex items-start gap-3">
          <UIcon :name="iconForItem(item)" class="size-6 text-(--ui-text-muted) shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <p class="font-medium truncate group-hover:text-(--ui-primary)">{{ item.title }}</p>
            <p class="text-xs text-(--ui-text-muted) truncate">
              {{ item.kind === 'doc' ? 'Document' : (item.filename ?? 'File') }}
              <span v-if="formatBytes(item.size_bytes)"> · {{ formatBytes(item.size_bytes) }}</span>
            </p>
          </div>
          <UIcon
            v-if="item.has_link"
            name="i-lucide-link"
            class="size-4 text-(--ui-primary) shrink-0"
            title="Has a public share link"
          />
        </div>

        <!-- Search-result snippet (server-escaped; only <b> markers) -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <p
          v-if="item.headline"
          class="files-snippet text-xs text-(--ui-text-muted) line-clamp-2"
          v-html="item.headline"
        />

        <div v-if="item.tags.length" class="flex flex-wrap gap-1">
          <UBadge
            v-for="t in item.tags"
            :key="t"
            :label="t"
            color="neutral"
            variant="soft"
            size="sm"
          />
        </div>

        <p class="text-xs text-(--ui-text-muted) mt-auto pt-1">
          {{ item.created_by_name ?? 'Unknown' }} · {{ fmtDate(item.last_edited_at ?? item.created_at) }}
        </p>
      </NuxtLink>
    </div>

    <!-- New document modal -->
    <UModal v-model:open="newDocOpen" title="New document">
      <template #body>
        <UInput
          v-model="newTitle"
          placeholder="Document title"
          autofocus
          class="w-full"
          @keyup.enter="createNewDoc"
        />
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" color="neutral" @click="newDocOpen = false">Cancel</UButton>
          <UButton :loading="creating" @click="createNewDoc">Create</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
