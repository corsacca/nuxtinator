<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { user } = useAuth()
const { data, refresh, start, stop } = useMessagesConversations()

const newChannelOpen = ref(false)
const newDmOpen = ref(false)

const activeId = computed(() => {
  const id = route.params.conversationId
  return Array.isArray(id) ? id[0] : id
})

onMounted(start)
onBeforeUnmount(stop)

function dmLabel(members: Array<{ id: string, display_name: string }>): string {
  const myId = user.value?.id ?? null
  const others = members.filter(m => m.id !== myId)
  if (others.length === 0) return 'You'
  if (others.length <= 3) return others.map(m => m.display_name).join(', ')
  return `${others.slice(0, 2).map(m => m.display_name).join(', ')} +${others.length - 2}`
}

function open(id: string) {
  // Build a path that respects /@<orgSlug>/messages/... if we're in multi mode.
  const slug = route.params.orgSlug as string | undefined
  const target = slug ? `/@${slug}/messages/${id}` : `/messages/${id}`
  router.push(target)
}

function onChannelCreated() {
  newChannelOpen.value = false
  refresh()
}
function onDmCreated(id: string) {
  newDmOpen.value = false
  refresh()
  open(id)
}
</script>

<template>
  <aside class="w-64 shrink-0 flex flex-col gap-4 h-full overflow-y-auto pr-2">
    <div>
      <div class="flex items-center justify-between px-1 mb-1">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">
          Channels
        </h3>
        <UButton
          icon="i-lucide-plus"
          variant="ghost"
          color="neutral"
          size="xs"
          aria-label="New channel"
          @click="newChannelOpen = true"
        />
      </div>
      <ul class="flex flex-col gap-0.5">
        <li v-for="ch in data.channels" :key="ch.id">
          <button
            class="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-(--ui-bg-elevated) transition-colors"
            :class="{ 'bg-(--ui-bg-elevated) text-(--ui-text)': activeId === ch.id, 'text-(--ui-text-muted)': activeId !== ch.id }"
            @click="open(ch.id)"
          >
            <UIcon name="i-lucide-hash" class="size-3.5 shrink-0" />
            <span class="text-sm flex-1 truncate">{{ ch.name }}</span>
            <UBadge
              v-if="ch.unread_count > 0"
              color="primary"
              variant="solid"
              size="sm"
            >
              {{ ch.unread_count > 99 ? '99+' : ch.unread_count }}
            </UBadge>
            <UIcon
              v-if="ch.subscribed"
              name="i-lucide-bell"
              class="size-3 text-(--ui-primary)"
              title="Subscribed to digest"
            />
          </button>
        </li>
        <li v-if="data.channels.length === 0" class="text-xs text-(--ui-text-muted) px-2 py-1">
          No channels yet.
        </li>
      </ul>
    </div>

    <div>
      <div class="flex items-center justify-between px-1 mb-1">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">
          Direct Messages
        </h3>
        <UButton
          icon="i-lucide-plus"
          variant="ghost"
          color="neutral"
          size="xs"
          aria-label="New DM"
          @click="newDmOpen = true"
        />
      </div>
      <ul class="flex flex-col gap-0.5">
        <li v-for="dm in data.dms" :key="dm.id">
          <button
            class="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-(--ui-bg-elevated) transition-colors"
            :class="{ 'bg-(--ui-bg-elevated) text-(--ui-text)': activeId === dm.id, 'text-(--ui-text-muted)': activeId !== dm.id }"
            @click="open(dm.id)"
          >
            <UIcon name="i-lucide-message-circle" class="size-3.5 shrink-0" />
            <span class="text-sm flex-1 truncate">{{ dmLabel(dm.members) }}</span>
            <UBadge
              v-if="dm.unread_count > 0"
              color="primary"
              variant="solid"
              size="sm"
            >
              {{ dm.unread_count > 99 ? '99+' : dm.unread_count }}
            </UBadge>
          </button>
        </li>
        <li v-if="data.dms.length === 0" class="text-xs text-(--ui-text-muted) px-2 py-1">
          No DMs yet.
        </li>
      </ul>
    </div>

    <MessagesNewChannelModal v-model:open="newChannelOpen" @created="onChannelCreated" />
    <MessagesNewDmModal v-model:open="newDmOpen" @created="onDmCreated" />
  </aside>
</template>
