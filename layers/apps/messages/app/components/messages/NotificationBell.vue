<script setup lang="ts">
const { items, unreadCount, refresh, markRead, start, stop } = useMessagesNotifications()
const open = ref(false)
const route = useRoute()
const router = useRouter()

onMounted(start)
onBeforeUnmount(stop)

watch(open, (v) => {
  if (v) refresh()
})

function kindLabel(kind: string): string {
  return kind === 'mention' ? 'mentioned you'
    : kind === 'dm' ? 'sent you a DM'
    : kind === 'reply' ? 'replied to a thread'
    : 'commented'
}

function timeAgo(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return d.toLocaleDateString()
}

async function openNotification(n: typeof items.value[number]) {
  if (!n.read_at) await markRead([n.id])
  open.value = false
  if (n.conversation_id) {
    const slug = route.params.orgSlug as string | undefined
    const target = slug ? `/@${slug}/messages/${n.conversation_id}` : `/messages/${n.conversation_id}`
    router.push(target)
  }
}

async function markAllRead() {
  await markRead()
}
</script>

<template>
  <UPopover v-model:open="open" :ui="{ content: 'w-80' }">
    <button class="bell-btn" aria-label="Notifications">
      <UIcon name="i-lucide-bell" class="size-4" />
      <span v-if="unreadCount > 0" class="badge">
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </button>
    <template #content>
      <div class="flex flex-col">
        <div class="flex items-center justify-between px-3 py-2 border-b border-(--ui-border)">
          <h3 class="text-sm font-semibold">
            Notifications
          </h3>
          <button
            v-if="unreadCount > 0"
            class="text-xs text-(--ui-primary) hover:underline"
            @click="markAllRead"
          >
            Mark all read
          </button>
        </div>
        <div class="max-h-96 overflow-y-auto">
          <div v-if="items.length === 0" class="px-3 py-6 text-center text-sm text-(--ui-text-muted)">
            Nothing new.
          </div>
          <button
            v-for="n in items"
            :key="n.id"
            class="w-full text-left flex items-start gap-2 px-3 py-2 hover:bg-(--ui-bg-elevated) border-b border-(--ui-border)/40"
            :class="{ 'bg-(--ui-bg-elevated)/50': !n.read_at }"
            @click="openNotification(n)"
          >
            <UAvatar
              v-if="n.actor"
              :src="n.actor.avatar"
              :alt="n.actor.display_name"
              size="xs"
              class="shrink-0 mt-0.5"
            />
            <div class="flex-1 min-w-0">
              <div class="text-sm">
                <span class="font-semibold">{{ n.actor?.display_name ?? 'Someone' }}</span>
                <span class="text-(--ui-text-muted)"> {{ kindLabel(n.kind) }}</span>
                <span v-if="n.conversation_name" class="text-(--ui-text-muted)">
                  in <span class="font-medium">#{{ n.conversation_name }}</span>
                </span>
              </div>
              <div v-if="n.excerpt" class="text-xs text-(--ui-text-muted) truncate">
                {{ n.excerpt.slice(0, 120) }}
              </div>
              <div class="text-xs text-(--ui-text-muted) mt-0.5">
                {{ timeAgo(n.created_at) }}
              </div>
            </div>
            <span v-if="!n.read_at" class="size-2 rounded-full bg-(--ui-primary) shrink-0 mt-1.5" />
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
.bell-btn {
  position: relative;
  padding: 0.375rem;
  border-radius: 6px;
  color: var(--ui-text-muted);
}
.bell-btn:hover {
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
}
.badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: var(--ui-primary);
  color: white;
  font-size: 0.6875rem;
  font-weight: 600;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
