<script setup lang="ts">
// The helpinator nav: "All conversations", then one channel per widget.
// Channels filter the conversation list via `?widget=<id>`.
defineProps<{
  // Highlights a channel off the list page (e.g. the widget a transcript came from).
  activeWidgetId?: string | null
}>()
defineEmits<{ navigated: [] }>()

interface SidebarWidget {
  id: string
  name: string
  // Only returned to managers.
  enabled?: boolean
}

const route = useRoute()
const pathTo = useHelpinatorPath()
const { data: status } = useHelpinatorStatus()
const { data: widgets } = useFetch<SidebarWidget[]>('/api/helpinator/widgets', {
  key: 'helpinator-sidebar-widgets',
  default: () => []
})

const listPath = computed(() => pathTo('/helpinator'))
const onList = computed(() => route.path === listPath.value)
const queryWidget = computed(() => typeof route.query.widget === 'string' ? route.query.widget : null)

const allActive = computed(() => onList.value && !queryWidget.value)

const itemClass = (active: boolean) => active
  ? 'bg-(--ui-bg-accented) text-(--ui-text) font-medium'
  : 'text-(--ui-text-muted) hover:bg-(--ui-bg-accented) hover:text-(--ui-text)'
</script>

<template>
  <div class="flex flex-col gap-4" @click="$emit('navigated')">
    <nav class="flex flex-col gap-px">
      <NuxtLink
        :to="listPath"
        class="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition"
        :class="itemClass(allActive)"
      >
        <UIcon name="i-lucide-messages-square" class="size-4 shrink-0" />
        <span class="truncate flex-1">All conversations</span>
      </NuxtLink>
    </nav>

    <div class="flex flex-col gap-1">
      <div class="flex items-center justify-between px-1 mb-1">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">
          Channels
        </h3>
        <UButton
          v-if="status?.canManage"
          :to="pathTo('/helpinator/widgets/new')"
          icon="i-lucide-plus"
          variant="ghost"
          color="neutral"
          size="xs"
          aria-label="New widget"
        />
      </div>

      <p v-if="widgets.length === 0" class="px-2 py-2 text-xs text-(--ui-text-muted)">
        No widgets yet.
      </p>

      <nav class="flex flex-col gap-px">
        <NuxtLink
          v-for="w in widgets"
          :key="w.id"
          :to="{ path: listPath, query: { widget: w.id } }"
          class="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition"
          :class="itemClass(onList ? queryWidget === w.id : activeWidgetId === w.id)"
        >
          <UIcon name="i-lucide-app-window" class="size-4 shrink-0" />
          <span class="truncate flex-1" :class="{ 'opacity-60': w.enabled === false }">{{ w.name }}</span>
          <span v-if="w.enabled === false" class="text-[10px] uppercase tracking-wide text-(--ui-text-dimmed)">Off</span>
        </NuxtLink>
      </nav>
    </div>
  </div>
</template>
