<script setup lang="ts">
// Public, no-login share view. layout:false + no auth middleware so anonymous
// visitors render it. The `/files/public` prefix is whitelisted in the tenancy
// route guard's SYSTEM_PREFIXES.

definePageMeta({
  layout: false
})

const route = useRoute()
const token = computed(() => route.params.token as string)

interface PublicDoc { kind: 'doc', title: string, body_md: string }
interface PublicFile { kind: 'file', title: string, filename: string | null, mime: string | null, size_bytes: string | null, url: string | null }
type PublicItem = PublicDoc | PublicFile

const item = ref<PublicItem | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const isImage = computed(() =>
  item.value?.kind === 'file' && (item.value.mime ?? '').startsWith('image/')
)
const lightboxOpen = ref(false)

onMounted(async () => {
  try {
    item.value = await $fetch<PublicItem>(`/api/files/public/${token.value}`)
  } catch (e: unknown) {
    const err = e as { statusMessage?: string, message?: string }
    error.value = err.statusMessage || err.message || 'This link is no longer available.'
  } finally {
    loading.value = false
  }
})

useHead({ title: 'Shared file' })
</script>

<template>
  <div class="min-h-screen bg-(--ui-bg) text-(--ui-text)">
    <div class="max-w-3xl mx-auto px-4 py-10">
      <div v-if="loading" class="text-center py-16 text-(--ui-text-muted)">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
      </div>

      <UEmpty
        v-else-if="error || !item"
        icon="i-lucide-link-2-off"
        title="Link unavailable"
        :description="error ?? 'This link is no longer available.'"
      />

      <template v-else>
        <h1 class="text-2xl font-semibold mb-6">{{ item.title }}</h1>

        <div v-if="item.kind === 'doc'" class="rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated) p-6">
          <FilesRenderer :body-md="item.body_md" />
        </div>

        <div v-else class="flex flex-col items-center gap-4">
          <img
            v-if="isImage && item.url"
            :src="item.url"
            :alt="item.title"
            class="max-w-full max-h-[75vh] rounded-lg border border-(--ui-border) cursor-zoom-in"
            @click="lightboxOpen = true"
          >
          <FilesImageLightbox
            v-if="isImage && item.url"
            v-model:open="lightboxOpen"
            :src="item.url"
            :alt="item.title"
          />
          <UButton
            v-if="item.url"
            :href="item.url"
            target="_blank"
            external
            size="lg"
            icon="i-lucide-download"
          >
            Download {{ item.filename }}
          </UButton>
        </div>
      </template>

      <p class="text-center text-xs text-(--ui-text-muted) mt-10">
        Shared via Files
      </p>
    </div>
  </div>
</template>
