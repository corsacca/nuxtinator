<script setup lang="ts">
// Title shown in the conversation top bar: "# channel-name" for channels, or
// the other participants' names for DMs. Reads from the shared sidebar
// conversations state (populated by the sidebar that renders on the same page).
const props = defineProps<{ conversationId: string | null }>()

const { data } = useMessagesConversations()
const { user } = useAuth()

const title = computed<{ icon: string, label: string } | null>(() => {
  const id = props.conversationId
  if (!id) return null

  const channel = data.value.channels.find(c => c.id === id)
  if (channel) return { icon: 'i-lucide-hash', label: channel.name ?? 'Untitled' }

  const dm = data.value.dms.find(d => d.id === id)
  if (dm) {
    const myId = user.value?.id ?? null
    const others = dm.members.filter(m => m.id !== myId)
    const label = others.length === 0
      ? 'You'
      : others.length <= 3
        ? others.map(m => m.display_name).join(', ')
        : `${others.slice(0, 2).map(m => m.display_name).join(', ')} +${others.length - 2}`
    return { icon: 'i-lucide-message-circle', label }
  }

  return null
})
</script>

<template>
  <div v-if="title" class="flex items-center gap-1.5 min-w-0">
    <UIcon :name="title.icon" class="size-4 text-(--ui-text-muted) shrink-0" />
    <span class="font-semibold truncate">{{ title.label }}</span>
  </div>
</template>
