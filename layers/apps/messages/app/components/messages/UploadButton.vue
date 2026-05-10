<script setup lang="ts">
// Paperclip button. On click, opens a file picker, uploads the file via
// /api/messages/uploads, then emits the result so the parent can create an
// image/file item in the active conversation.

const emit = defineEmits<{
  uploaded: [payload: { kind: 'image' | 'file', upload: { storage_key: string, filename: string, mime: string, size_bytes: number } }]
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const error = ref<string | null>(null)

function pick() {
  fileInput.value?.click()
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  uploading.value = true
  error.value = null
  try {
    const form = new FormData()
    form.append('file', file)
    const res = await $fetch<{ storage_key: string, filename: string, mime: string, size_bytes: number }>(
      '/api/messages/uploads',
      { method: 'POST', body: form }
    )
    const kind: 'image' | 'file' = file.type.startsWith('image/') ? 'image' : 'file'
    emit('uploaded', {
      kind,
      upload: {
        storage_key: res.storage_key,
        filename: res.filename,
        mime: res.mime,
        size_bytes: res.size_bytes
      }
    })
  } catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? 'Upload failed.'
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="upload-wrap">
    <button
      class="upload-btn"
      :disabled="uploading"
      :title="uploading ? 'Uploading...' : 'Attach a file'"
      @click="pick"
    >
      <UIcon
        :name="uploading ? 'i-lucide-loader-circle' : 'i-lucide-paperclip'"
        class="size-4"
        :class="{ 'animate-spin': uploading }"
      />
    </button>
    <input
      ref="fileInput"
      type="file"
      class="sr-only"
      @change="onFile"
    >
    <div v-if="error" class="error-tooltip">
      {{ error }}
    </div>
  </div>
</template>

<style scoped>
.upload-wrap {
  position: relative;
  display: inline-block;
}
.upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  border-radius: 6px;
  color: var(--ui-text-muted);
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
}
.upload-btn:hover:not(:disabled) {
  color: var(--ui-text);
  border-color: var(--ui-border-accented);
}
.upload-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.error-tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  right: 0;
  background: var(--ui-error);
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  white-space: nowrap;
}
</style>
