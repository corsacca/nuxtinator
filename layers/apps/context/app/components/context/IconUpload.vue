<script setup lang="ts">
interface Props { slug: string, iconUrl: string | null }
const props = defineProps<Props>()
const uploading = ref(false)
const error = ref<string | null>(null)

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  error.value = null
  try {
    const fd = new FormData()
    fd.append('file', file)
    await $fetch(`/api/context/portfolios/${props.slug}/icon`, {
      method: 'POST',
      body: fd,
      headers: $fetchHeaders()
    })
    await reloadNuxtApp({ path: window.location.pathname })
  } catch (e) {
    error.value = (e as Error).message ?? 'Upload failed.'
  } finally {
    uploading.value = false
  }
}

function $fetchHeaders(): Record<string, string> {
  const slug = getActiveSlug()
  return slug ? { 'X-Active-Org': slug } : {}
}
</script>

<template>
  <div class="flex items-center gap-3">
    <img v-if="iconUrl" :src="iconUrl" alt="" class="size-16 rounded object-cover">
    <div class="size-16 rounded grid place-items-center bg-(--ui-bg-elevated)" v-else>
      <UIcon name="i-lucide-image" class="size-6 text-(--ui-text-muted)" />
    </div>
    <label class="cursor-pointer">
      <input type="file" accept="image/*" class="hidden" @change="onPick">
      <UButton as="span" variant="outline" :loading="uploading">
        Upload
      </UButton>
    </label>
    <p v-if="error" class="text-(--ui-error) text-sm">
      {{ error }}
    </p>
  </div>
</template>
