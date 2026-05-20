<script setup lang="ts">
// Digest subscribe/unsubscribe toggle for the conversation header. Renders
// only for channels (DMs notify participants implicitly). Subscription state
// is read from the shared sidebar conversations list and refreshed after a
// toggle so the header button and the sidebar bell stay in sync.
const props = defineProps<{ conversationId: string | null }>()

const { data, refresh } = useMessagesConversations()

const channel = computed(() =>
  props.conversationId
    ? data.value.channels.find(c => c.id === props.conversationId) ?? null
    : null
)

const busy = ref(false)

async function toggle() {
  const ch = channel.value
  if (!ch || busy.value) return
  busy.value = true
  const action = ch.subscribed ? 'unsubscribe' : 'subscribe'
  try {
    await $fetch(`/api/messages/conversations/${ch.id}/${action}`, { method: 'POST' })
    await refresh()
  } catch (e) {
    console.error('Failed to toggle subscription:', e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UButton
    v-if="channel"
    :icon="channel.subscribed ? 'i-lucide-bell' : 'i-lucide-bell-off'"
    :color="channel.subscribed ? 'primary' : 'neutral'"
    variant="ghost"
    size="sm"
    :loading="busy"
    :aria-label="channel.subscribed ? 'Unsubscribe from daily digest' : 'Subscribe to daily digest'"
    :title="channel.subscribed ? 'Subscribed to daily digest — click to unsubscribe' : 'Not subscribed — click to get the daily digest'"
    @click="toggle"
  />
</template>
