<script setup lang="ts">
// New outbound conversation: recipient + subject + body → POST
// /api/inbox/conversations, then navigate to the created thread.
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ created: [id: string] }>()

const toEmail = ref('')
const subject = ref('')
const body = ref('')
const sending = ref(false)
const error = ref<string | null>(null)

watch(open, (v) => {
  if (v) {
    toEmail.value = ''
    subject.value = ''
    body.value = ''
    error.value = null
  }
})

async function submit() {
  if (!toEmail.value || !subject.value || !body.value.trim()) return
  sending.value = true
  error.value = null
  try {
    const res = await $fetch<{ id: string }>('/api/inbox/conversations', {
      method: 'POST',
      body: { toEmail: toEmail.value, subject: subject.value, body: body.value }
    })
    open.value = false
    emit('created', res.id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to send'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="New email">
    <template #body>
      <div class="space-y-3">
        <UFormField label="To" required>
          <UInput v-model="toEmail" type="email" placeholder="someone@example.com" class="w-full" />
        </UFormField>
        <UFormField label="Subject" required>
          <UInput v-model="subject" placeholder="Subject" class="w-full" />
        </UFormField>
        <UFormField label="Message" required>
          <UEditor
            v-model="body"
            content-type="html"
            placeholder="Write your message…"
            :image="false"
            :mention="false"
            class="min-h-32 max-h-72 overflow-y-auto rounded-md border border-(--ui-border)"
          />
        </UFormField>
        <UAlert v-if="error" color="error" variant="subtle" :title="error" />
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton label="Cancel" variant="ghost" color="neutral" @click="open = false" />
        <UButton label="Send" icon="i-lucide-send" :loading="sending" @click="submit" />
      </div>
    </template>
  </UModal>
</template>
