<script setup lang="ts">
import type { SidebarNavItem } from '#core/app/utils/sidebar-nav'

defineEmits<{
  navigated: []
}>()

const route = useRoute()
const { user } = useAuth()
const { data, refresh, start, stop } = useMessagesConversations()

const newChannelOpen = ref(false)
const newDmOpen = ref(false)

onMounted(start)
onBeforeUnmount(stop)

function dmLabel(members: Array<{ id: string, display_name: string }>): string {
  const myId = user.value?.id ?? null
  const others = members.filter(m => m.id !== myId)
  if (others.length === 0) return 'You'
  if (others.length <= 3) return others.map(m => m.display_name).join(', ')
  return `${others.slice(0, 2).map(m => m.display_name).join(', ')} +${others.length - 2}`
}

function pathFor(id: string): string {
  const slug = route.params.orgSlug as string | undefined
  return slug ? `/@${slug}/messages/${id}` : `/messages/${id}`
}

interface ChannelMeta { unread: number, muted: boolean }
interface DmMeta { unread: number }

const channelItems = computed<SidebarNavItem[]>(() =>
  data.value.channels.map(ch => ({
    to: pathFor(ch.id),
    label: ch.name ?? 'Untitled',
    icon: 'i-lucide-hash',
    exact: true,
    meta: { unread: ch.unread_count, muted: ch.muted } satisfies ChannelMeta
  }))
)

const dmItems = computed<SidebarNavItem[]>(() =>
  data.value.dms.map(dm => ({
    to: pathFor(dm.id),
    label: dmLabel(dm.members),
    icon: 'i-lucide-message-circle',
    exact: true,
    meta: { unread: dm.unread_count } satisfies DmMeta
  }))
)

function onChannelCreated() {
  newChannelOpen.value = false
  refresh()
}
function onDmCreated(id: string) {
  newDmOpen.value = false
  refresh()
  navigateTo(pathFor(id))
}
</script>

<template>
  <div
    class="flex flex-col gap-4"
    @click="$emit('navigated')"
  >
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
          @click.stop="newChannelOpen = true"
        />
      </div>
      <SidebarNav
        v-if="channelItems.length > 0"
        :items="channelItems"
        class="-mx-3"
      >
        <template #trailing="{ item }">
          <UBadge
            v-if="(item.meta as ChannelMeta).unread > 0"
            color="primary"
            variant="solid"
            size="sm"
          >
            {{ (item.meta as ChannelMeta).unread > 99 ? '99+' : (item.meta as ChannelMeta).unread }}
          </UBadge>
          <UIcon
            v-if="(item.meta as ChannelMeta).muted"
            name="i-lucide-bell-off"
            class="size-3 text-(--ui-text-dimmed)"
            title="Digest muted"
          />
        </template>
      </SidebarNav>
      <p
        v-else
        class="text-xs text-(--ui-text-muted) px-2 py-1"
      >
        No channels yet.
      </p>
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
          @click.stop="newDmOpen = true"
        />
      </div>
      <SidebarNav
        v-if="dmItems.length > 0"
        :items="dmItems"
        class="-mx-3"
      >
        <template #trailing="{ item }">
          <UBadge
            v-if="(item.meta as DmMeta).unread > 0"
            color="primary"
            variant="solid"
            size="sm"
          >
            {{ (item.meta as DmMeta).unread > 99 ? '99+' : (item.meta as DmMeta).unread }}
          </UBadge>
        </template>
      </SidebarNav>
      <p
        v-else
        class="text-xs text-(--ui-text-muted) px-2 py-1"
      >
        No DMs yet.
      </p>
    </div>

    <MessagesNewChannelModal
      v-model:open="newChannelOpen"
      @created="onChannelCreated"
    />
    <MessagesNewDmModal
      v-model:open="newDmOpen"
      @created="onDmCreated"
    />
  </div>
</template>
