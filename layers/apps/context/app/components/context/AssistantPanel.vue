<script setup lang="ts">
interface Props { slug: string, currentKey: string }
const props = defineProps<Props>()
const emit = defineEmits(['applied'])

interface ProposedUpdate {
  section_key: string
  section_title: string
  current_content: string
  proposed_content: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const history = ref<ChatMessage[]>([])
const draft = ref('')
const sending = ref(false)
const proposed = ref<ProposedUpdate[]>([])
const contextLoaded = ref<string[]>([])

async function send() {
  const message = draft.value.trim()
  if (!message) return
  sending.value = true
  history.value.push({ role: 'user', content: message })
  draft.value = ''
  try {
    const data = await $fetch<{
      reply: string
      proposed_updates: ProposedUpdate[]
      context_loaded: string[]
    }>(`/api/context/portfolios/${props.slug}/assistant/chat`, {
      method: 'POST',
      body: { message, history: history.value.slice(0, -1) }
    })
    if (data) {
      history.value.push({ role: 'assistant', content: data.reply })
      proposed.value = data.proposed_updates
      contextLoaded.value = data.context_loaded
    }
  } finally {
    sending.value = false
  }
}

async function apply(u: ProposedUpdate) {
  await $fetch(`/api/context/portfolios/${props.slug}/assistant/apply`, {
    method: 'POST',
    body: { section_key: u.section_key, proposed_content: u.proposed_content }
  })
  proposed.value = proposed.value.filter(p => p.section_key !== u.section_key)
  emit('applied')
}
</script>

<template>
  <div class="h-full flex flex-col">
    <header class="p-3 border-b border-(--ui-border) flex items-center gap-2">
      <UIcon name="i-lucide-sparkles" class="text-(--ui-primary)" />
      <h3 class="font-semibold">
        Assistant
      </h3>
    </header>

    <div class="flex-1 overflow-auto p-3 space-y-3">
      <p v-if="history.length === 0" class="text-sm text-(--ui-text-muted)">
        Ask a question about this portfolio, or describe a change you'd like.
      </p>
      <article
        v-for="(m, idx) in history"
        :key="idx"
        class="text-sm"
        :class="m.role === 'user' ? 'text-(--ui-text)' : 'text-(--ui-text-muted)'"
      >
        <div class="font-medium text-xs mb-1">
          {{ m.role === 'user' ? 'You' : 'Assistant' }}
        </div>
        <p class="whitespace-pre-wrap">
          {{ m.content }}
        </p>
      </article>

      <div v-if="proposed.length" class="space-y-2 border-t border-(--ui-border) pt-3">
        <h4 class="text-sm font-semibold">
          Proposed updates
        </h4>
        <div v-for="u in proposed" :key="u.section_key" class="border border-(--ui-border) rounded p-2 space-y-2">
          <div class="text-sm font-medium">
            {{ u.section_title }}
            <code class="text-xs font-normal text-(--ui-text-muted)">{{ u.section_key }}</code>
          </div>
          <pre class="text-xs bg-(--ui-bg-elevated) p-2 rounded max-h-32 overflow-auto whitespace-pre-wrap">{{ u.proposed_content }}</pre>
          <UButton size="xs" @click="apply(u)">
            Apply
          </UButton>
        </div>
      </div>
    </div>

    <footer class="p-3 border-t border-(--ui-border) flex items-end gap-2">
      <UTextarea v-model="draft" placeholder="Message…" :rows="2" class="flex-1" />
      <UButton :loading="sending" :disabled="!draft.trim()" @click="send">
        Send
      </UButton>
    </footer>
  </div>
</template>
