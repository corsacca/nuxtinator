<script setup lang="ts">
// New outbound conversation: recipient + subject + body → POST
// /api/inbox/conversations, then navigate to the created thread. When opened
// from a CRM record, `lockedRecipient` pins the recipient to that contact's
// email channel — the To field is read-only and the send carries channelId
// instead of a free-text address. Offers the same From-identity choice and
// inline-image insertion as the reply composer; images upload through the
// conversation-less endpoint (the org scopes them).
const props = defineProps<{ lockedRecipient?: { channelId: string, label: string } }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ created: [id: string] }>()

const { me } = useInboxMe()

const toEmail = ref('')
const subject = ref('')
const body = ref('')
const sending = ref(false)
const error = ref<string | null>(null)

// From identity — offered only when the agent has a personal alias. A fresh
// conversation has no thread continuity to follow, so personal is the default
// when available (matching how agents introduce themselves).
const fromIdentity = ref<'personal' | 'contact'>('contact')
const fromOptions = computed(() => {
  const opts: { label: string, value: 'personal' | 'contact' }[] = []
  if (me.value?.personalFrom) opts.push({ label: `You · ${me.value.personalFrom}`, value: 'personal' })
  opts.push({ label: `${me.value?.brandFromName || 'Shared'} · ${me.value?.contactAddress ?? 'contact address'}`, value: 'contact' })
  return opts
})
const signatureNotice = computed(() => {
  if (fromIdentity.value !== 'personal') return 'no signature'
  return me.value?.signature ? 'your signature is added' : 'no signature set'
})

watch(open, (v) => {
  if (v) {
    toEmail.value = ''
    subject.value = ''
    body.value = ''
    error.value = null
    fromIdentity.value = me.value?.personalFrom ? 'personal' : 'contact'
  }
})

// Inline images: upload immediately (org-scoped, no conversation needed) and
// insert the auth-proxy URL; the CID pipeline embeds it at send time.
const editorRef = ref<{ editor?: { chain: () => { focus: () => { setImage: (o: { src: string }) => { run: () => void } } } } } | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const insertingImage = ref(false)

async function onImagePicked(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  insertingImage.value = true
  try {
    const form = new FormData()
    form.append('image', file)
    const res = await $fetch<{ url: string }>('/api/inbox/inline-images', { method: 'POST', body: form })
    editorRef.value?.editor?.chain().focus().setImage({ src: res.url }).run()
  } catch (err) {
    useToast().add({ title: 'Image upload failed', description: err instanceof Error ? err.message : undefined, color: 'error' })
  } finally {
    insertingImage.value = false
  }
}

async function submit() {
  const hasRecipient = props.lockedRecipient ? true : !!toEmail.value
  if (!hasRecipient || !subject.value || !body.value.trim()) return
  sending.value = true
  error.value = null
  try {
    const recipient = props.lockedRecipient
      ? { channelId: props.lockedRecipient.channelId }
      : { toEmail: toEmail.value }
    const res = await $fetch<{ id: string }>('/api/inbox/conversations', {
      method: 'POST',
      body: {
        ...recipient,
        subject: subject.value,
        body: body.value,
        ...(me.value?.personalFrom ? { fromIdentity: fromIdentity.value } : {})
      }
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
          <UInput
            v-if="lockedRecipient"
            :model-value="lockedRecipient.label"
            disabled
            class="w-full"
          />
          <UInput v-else v-model="toEmail" type="email" placeholder="someone@example.com" class="w-full" />
        </UFormField>
        <UFormField v-if="fromOptions.length > 1" label="From" :hint="signatureNotice">
          <USelect v-model="fromIdentity" :items="fromOptions" class="w-full" />
        </UFormField>
        <UFormField label="Subject" required>
          <UInput v-model="subject" placeholder="Subject" class="w-full" />
        </UFormField>
        <UFormField label="Message" required>
          <UEditor
            ref="editorRef"
            v-model="body"
            content-type="html"
            placeholder="Write your message…"
            :image="true"
            :mention="false"
            class="inbox-composer-editor min-h-32 max-h-72 overflow-y-auto rounded-md border border-(--ui-border)"
          />
        </UFormField>
        <div class="flex items-center">
          <UButton
            icon="i-lucide-image"
            label="Image"
            size="xs"
            color="neutral"
            variant="ghost"
            :loading="insertingImage"
            :disabled="sending || insertingImage"
            @click="imageInput?.click()"
          />
          <input ref="imageInput" type="file" accept="image/*" class="hidden" @change="onImagePicked">
        </div>
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

<style scoped>
/* Match the size cap outbound mail applies per <img> at send time
   (inboxConstrainImages), so the composer shows what recipients will see. */
.inbox-composer-editor :deep(img) {
  max-width: 100%;
  max-height: 480px;
  height: auto;
}
</style>
