<script setup lang="ts">
// The compose window. Owns the editable copy of the open draft, autosaves
// through the compose composable, and hands off sending (with undo).
import type { useGmailCompose } from '../../composables/useGmailCompose'
import type { GmailAccount } from '../../composables/useGmailAccounts'
import type { GmailAddressView } from '../../utils/gmail-format'

const props = defineProps<{
  compose: ReturnType<typeof useGmailCompose>
  accounts: GmailAccount[]
}>()

const open = computed({
  get: () => props.compose.open.value,
  set: (v: boolean) => {
    if (!v) void props.compose.close()
  }
})

const to = ref<GmailAddressView[]>([])
const cc = ref<GmailAddressView[]>([])
const bcc = ref<GmailAddressView[]>([])
const subject = ref('')
const body = ref('')
const accountId = ref('')
const showCc = ref(false)
const showBcc = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

// Load the editable copy whenever a different draft opens.
watch(() => props.compose.draft.value?.id, () => {
  const d = props.compose.draft.value
  if (!d) return
  to.value = d.to
  cc.value = d.cc
  bcc.value = d.bcc
  subject.value = d.subject ?? ''
  body.value = d.bodyHtml ?? ''
  accountId.value = d.accountId
  showCc.value = d.cc.length > 0
  showBcc.value = d.bcc.length > 0
}, { immediate: true })

watch(to, v => props.compose.queueSave({ to: v }), { deep: true })
watch(cc, v => props.compose.queueSave({ cc: v }), { deep: true })
watch(bcc, v => props.compose.queueSave({ bcc: v }), { deep: true })
watch(subject, v => props.compose.queueSave({ subject: v }))
watch(body, v => props.compose.queueSave({ bodyHtml: v }))
watch(accountId, (v, old) => {
  if (old && v !== old) props.compose.queueSave({ accountId: v })
})

const isReply = computed(() => !!props.compose.draft.value?.threadId)
const accountItems = computed(() => props.accounts.map(a => ({ label: a.displayName ? `${a.displayName} <${a.email}>` : a.email, value: a.id })))
const modeLabel = computed(() => {
  const m = props.compose.draft.value?.mode
  return m === 'reply' ? 'Reply' : m === 'reply_all' ? 'Reply all' : m === 'forward' ? 'Forward' : 'New message'
})
const canSend = computed(() => to.value.length + cc.value.length + bcc.value.length > 0 && !props.compose.sending.value)

async function onFilesPicked(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length) return
  uploading.value = true
  try {
    for (const f of files) await props.compose.attach(f)
  } catch (err) {
    useToast().add({ title: 'Attachment failed', description: gmailErrorMessage(err), color: 'error' })
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="modeLabel"
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <div
        v-if="compose.draft.value"
        class="space-y-3"
      >
        <UFormField
          v-if="!isReply && accounts.length > 1"
          label="From"
        >
          <USelect
            v-model="accountId"
            :items="accountItems"
            class="w-full"
            size="sm"
          />
        </UFormField>
        <p
          v-else
          class="text-xs text-(--ui-text-muted)"
        >
          From {{ accounts.find(a => a.id === accountId)?.email ?? '' }}
        </p>
        <UFormField label="To">
          <div class="flex items-start gap-2">
            <GmailAddressInput
              v-model="to"
              placeholder="Recipients"
              class="flex-1"
            />
            <div class="flex gap-1 pt-1">
              <UButton
                v-if="!showCc"
                label="Cc"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="showCc = true"
              />
              <UButton
                v-if="!showBcc"
                label="Bcc"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="showBcc = true"
              />
            </div>
          </div>
        </UFormField>
        <UFormField
          v-if="showCc"
          label="Cc"
        >
          <GmailAddressInput
            v-model="cc"
            placeholder="Cc"
          />
        </UFormField>
        <UFormField
          v-if="showBcc"
          label="Bcc"
        >
          <GmailAddressInput
            v-model="bcc"
            placeholder="Bcc"
          />
        </UFormField>
        <UFormField label="Subject">
          <UInput
            v-model="subject"
            placeholder="Subject"
            class="w-full"
            size="sm"
          />
        </UFormField>
        <UEditor
          v-model="body"
          content-type="html"
          placeholder="Write your message…"
          :image="false"
          :mention="false"
          class="gmail-composer-editor min-h-48 max-h-[50vh] overflow-y-auto rounded-md border border-(--ui-border)"
        />
        <div
          v-if="compose.draft.value.attachments.length"
          class="flex flex-wrap gap-2"
        >
          <span
            v-for="a in compose.draft.value.attachments"
            :key="a.id"
            class="inline-flex items-center gap-1.5 rounded-md border border-(--ui-border) px-2 py-1 text-xs"
          >
            <UIcon
              name="i-lucide-paperclip"
              class="size-3.5 text-(--ui-text-dimmed)"
            />
            <span class="truncate max-w-48">{{ a.filename }}</span>
            <span class="text-(--ui-text-dimmed)">{{ gmailFileSize(a.size) }}</span>
            <UButton
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="link"
              square
              @click="compose.detach(a.id)"
            />
          </span>
        </div>
        <UAlert
          v-if="compose.error.value"
          color="error"
          variant="subtle"
          :title="compose.error.value"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex items-center gap-2 w-full">
        <UButton
          label="Send"
          icon="i-lucide-send"
          :disabled="!canSend"
          :loading="compose.sending.value"
          @click="compose.send()"
        />
        <UButton
          icon="i-lucide-paperclip"
          size="sm"
          color="neutral"
          variant="ghost"
          square
          title="Attach files"
          :loading="uploading"
          @click="fileInput?.click()"
        />
        <input
          ref="fileInput"
          type="file"
          multiple
          class="hidden"
          @change="onFilesPicked"
        >
        <span class="text-xs text-(--ui-text-dimmed)">{{ compose.saving.value ? 'Saving…' : 'Draft saved' }}</span>
        <div class="ml-auto flex items-center gap-1">
          <UButton
            label="Close"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="compose.close()"
          />
          <UButton
            icon="i-lucide-trash-2"
            size="sm"
            color="neutral"
            variant="ghost"
            square
            title="Discard draft"
            @click="compose.discard()"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.gmail-composer-editor :deep(img) {
  max-width: 100%;
  height: auto;
}
</style>
