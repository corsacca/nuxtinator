<script setup lang="ts">
import type { InboxAiDraftPreview, InboxAiMetadata } from '../../composables/useInboxThread'

// Steer/refine AI draft modal. Generates a draft in preview mode (no
// persistence); the reviewer can steer with accumulating instructions and
// refine, then "Use response" hands the draft to the composer. Never
// auto-generates on open (spends no call unprompted).
const props = defineProps<{ conversationId: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ use: [{ html: string, text: string, meta: InboxAiMetadata }] }>()

const toast = useToast()
const { generateAiDraft } = useInboxThread(() => props.conversationId)

const direction = ref('')
const directions = ref<string[]>([])
const generating = ref(false)
const result = ref<InboxAiDraftPreview | null>(null)

// Show the English gloss column only when the draft isn't English.
const needsTranslation = computed(() =>
  !!result.value?.english_gloss && !result.value.draft_language.toLowerCase().startsWith('en')
)

watch(open, (v) => {
  if (v) {
    direction.value = ''
    directions.value = []
    generating.value = false
    result.value = null
  }
})

function removeInstruction(i: number) {
  directions.value.splice(i, 1)
}

function buildDirection(): string | undefined {
  if (!directions.value.length) return undefined
  return directions.value.map((d, i) => `${i + 1}. ${d}`).join('\n')
}

async function run() {
  // Fold the current steer into the accumulated list (clearing it first so a
  // failed retry doesn't double-add), then generate/refine.
  const steer = direction.value.trim()
  if (steer) {
    directions.value.push(steer)
    direction.value = ''
  }
  generating.value = true
  try {
    result.value = await generateAiDraft({
      direction: buildDirection(),
      // Refine revises the current draft rather than starting over.
      baseDraft: result.value ? result.value.draft_html : undefined
    })
  } catch (err: unknown) {
    const status = (err as { statusCode?: number } | null)?.statusCode
    toast.add({
      title: status === 503
        ? 'AI is not configured'
        : status === 502
          ? 'The AI is busy — try again in a moment'
          : 'Could not generate a draft',
      color: 'error'
    })
  } finally {
    generating.value = false
  }
}

function use() {
  if (!result.value) return
  emit('use', {
    html: result.value.draft_html,
    text: result.value.draft_text,
    meta: {
      gloss: result.value.english_gloss,
      language: result.value.draft_language,
      sources: result.value.sources_used,
      uncertainty: result.value.uncertainty,
      // Stamped server-side on save.
      model: ''
    }
  })
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Draft with AI"
    description="A human reviews and edits every draft before it's sent."
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Accumulated steer instructions -->
        <div
          v-if="directions.length"
          class="flex flex-wrap gap-1.5"
        >
          <UButton
            v-for="(d, i) in directions"
            :key="i"
            color="neutral"
            variant="soft"
            size="xs"
            trailing-icon="i-lucide-x"
            @click="removeInstruction(i)"
          >
            {{ d }}
          </UButton>
        </div>

        <div class="flex items-start gap-2">
          <UTextarea
            v-model="direction"
            :rows="2"
            class="flex-1"
            placeholder="Optional: steer the draft (e.g. 'keep it short', 'offer a call')…"
            :disabled="generating"
            @keydown.meta.enter="run"
          />
          <UButton
            :loading="generating"
            :icon="result ? 'i-lucide-refresh-cw' : 'i-lucide-sparkles'"
            @click="run"
          >
            {{ result ? 'Refine' : 'Generate' }}
          </UButton>
        </div>

        <div
          v-if="!result && !generating"
          class="text-sm text-(--ui-text-muted)"
        >
          Add optional steering above, then Generate. The draft grounds on your
          tone guide, knowledge base, and the contact's record.
        </div>

        <template v-if="result">
          <!-- Uncertainty — facts the reviewer must confirm -->
          <UAlert
            v-if="result.uncertainty.length"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="Confirm before sending"
          >
            <template #description>
              <ul class="list-disc pl-4 space-y-0.5">
                <li
                  v-for="(u, i) in result.uncertainty"
                  :key="i"
                >
                  {{ u }}
                </li>
              </ul>
            </template>
          </UAlert>

          <!-- Draft (+ English gloss when not English) -->
          <div :class="needsTranslation ? 'grid grid-cols-2 gap-3' : ''">
            <div>
              <div class="text-xs font-medium text-(--ui-text-muted) mb-1">
                Draft ({{ result.draft_language }})
              </div>
              <div class="text-sm whitespace-pre-wrap rounded-md border border-(--ui-border) p-3 max-h-64 overflow-y-auto">
                {{ result.draft_text }}
              </div>
            </div>
            <div v-if="needsTranslation">
              <div class="text-xs font-medium text-(--ui-text-muted) mb-1">
                English (for review)
              </div>
              <div class="text-sm whitespace-pre-wrap rounded-md border border-(--ui-border) p-3 max-h-64 overflow-y-auto text-(--ui-text-muted)">
                {{ result.english_gloss }}
              </div>
            </div>
          </div>

          <!-- Sources -->
          <div
            v-if="result.sources_used.length"
            class="flex flex-wrap items-center gap-1.5"
          >
            <span class="text-xs text-(--ui-text-muted)">Grounded on:</span>
            <UBadge
              v-for="(s, i) in result.sources_used"
              :key="i"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              {{ s }}
            </UBadge>
          </div>
        </template>
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
          :disabled="!result"
          icon="i-lucide-check"
          @click="use"
        >
          Use response
        </UButton>
      </div>
    </template>
  </UModal>
</template>
