<script setup lang="ts">
// Extract an anonymised Q&A from the current thread and, after human review of
// the stripped-PII list, save it to the knowledge base. Auto-suggests on open.
const props = defineProps<{ conversationId: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
const { create } = useInboxKnowledge()

const loading = ref(false)
const saving = ref(false)
const question = ref('')
const answer = ref('')
const language = ref('en')
const removed = ref<string[]>([])

watch(open, async (v) => {
  if (!v) return
  question.value = ''
  answer.value = ''
  language.value = 'en'
  removed.value = []
  loading.value = true
  try {
    const url: string = `/api/inbox/conversations/${props.conversationId}/knowledge-entry/suggest`
    const res = await $fetch<{ question: string, answer: string, language: string, removed: string[] }>(url, { method: 'POST' })
    question.value = res.question
    answer.value = res.answer
    language.value = res.language || 'en'
    removed.value = res.removed ?? []
  } catch (err: unknown) {
    const status = (err as { statusCode?: number } | null)?.statusCode
    toast.add({
      title: status === 503 ? 'AI is not configured' : status === 502 ? 'The AI is busy — try again' : 'Could not extract an entry',
      color: 'error'
    })
    open.value = false
  } finally {
    loading.value = false
  }
})

const canSave = computed(() => question.value.trim().length > 0 && answer.value.trim().length > 0)

async function save() {
  if (!canSave.value) return
  saving.value = true
  try {
    await create({
      question: question.value.trim(),
      answer: answer.value.trim(),
      language: language.value.trim() || 'en',
      sourceConversationId: props.conversationId
    })
    toast.add({ title: 'Added to knowledge base', color: 'success' })
    emit('saved')
    open.value = false
  } catch {
    toast.add({ title: 'Could not save the entry', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Add to knowledge base"
    description="An anonymised Q&A the AI can reference for future replies."
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <div
        v-if="loading"
        class="py-8 text-center text-sm text-(--ui-text-muted)"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-5 animate-spin"
        />
        <div class="mt-2">
          Extracting an anonymised entry…
        </div>
      </div>

      <div
        v-else
        class="space-y-4"
      >
        <UAlert
          v-if="removed.length"
          color="success"
          variant="subtle"
          icon="i-lucide-shield-check"
          title="Personal information removed"
          :description="removed.join(', ')"
        />

        <UFormField label="Question">
          <UTextarea
            v-model="question"
            :rows="2"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Answer">
          <UTextarea
            v-model="answer"
            :rows="6"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Language">
          <UInput
            v-model="language"
            class="w-32"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          @click="open = false"
        >
          Cancel
        </UButton>
        <UButton
          :disabled="!canSave || loading"
          :loading="saving"
          icon="i-lucide-plus"
          @click="save"
        >
          Save entry
        </UButton>
      </div>
    </template>
  </UModal>
</template>
