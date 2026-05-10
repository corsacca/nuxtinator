<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  created: []
}>()

const name = ref('')
const description = ref('')
const submitting = ref(false)
const errorMsg = ref<string | null>(null)

watch(open, (v) => {
  if (v) {
    name.value = ''
    description.value = ''
    errorMsg.value = null
  }
})

async function submit() {
  if (!name.value.trim()) return
  submitting.value = true
  errorMsg.value = null
  try {
    await $fetch('/api/messages/conversations/channels', {
      method: 'POST',
      body: { name: name.value.trim(), description: description.value.trim() || undefined }
    })
    emit('created')
  } catch (e) {
    errorMsg.value = (e as { statusMessage?: string }).statusMessage ?? 'Failed to create channel.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="New channel" :ui="{ content: 'max-w-md' }">
    <template #body>
      <form class="flex flex-col gap-3" @submit.prevent="submit">
        <UFormField label="Name" required>
          <UInput v-model="name" placeholder="general" maxlength="80" />
        </UFormField>
        <UFormField label="Description">
          <UInput v-model="description" placeholder="What's this channel for?" maxlength="500" />
        </UFormField>
        <p v-if="errorMsg" class="text-xs text-(--ui-error)">
          {{ errorMsg }}
        </p>
        <div class="flex justify-end gap-2 mt-2">
          <UButton variant="ghost" color="neutral" :disabled="submitting" @click="open = false">
            Cancel
          </UButton>
          <UButton type="submit" :loading="submitting" :disabled="!name.trim()">
            Create
          </UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>
