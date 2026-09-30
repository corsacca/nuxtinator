<script setup lang="ts">
// Page frame for every helpinator page: the app's own sidebar (docked on
// desktop, a slide-over on mobile) beside a scrolling content column. Drawn by
// the app rather than core's shared app sidebar, like the context app.
defineProps<{
  title: string
  activeWidgetId?: string | null
}>()

const route = useRoute()
const pathTo = useHelpinatorPath()
const { data: status } = useHelpinatorStatus()

const open = ref(false)
watch(() => route.fullPath, () => { open.value = false })

const widgetsPath = computed(() => pathTo('/helpinator/widgets'))
const onWidgets = computed(() => route.path === widgetsPath.value || route.path.startsWith(widgetsPath.value + '/'))
</script>

<template>
  <div class="flex h-[calc(100vh-57px)] -mx-4 sm:-mx-6 lg:-mx-8 -my-6 lg:-my-8">
    <SidebarPanel class="hidden lg:flex w-64 shrink-0">
      <template #header>
        <h1 class="text-xl font-semibold">
          Helpinator
        </h1>
      </template>
      <HelpinatorSidebarBody :active-widget-id="activeWidgetId" />
      <template v-if="status?.canManage" #footer>
        <NuxtLink
          :to="widgetsPath"
          class="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition"
          :class="onWidgets
            ? 'bg-(--ui-bg-accented) text-(--ui-text) font-medium'
            : 'text-(--ui-text-muted) hover:bg-(--ui-bg-accented) hover:text-(--ui-text)'"
        >
          <UIcon name="i-lucide-settings" class="size-4 shrink-0" />
          <span>Manage widgets</span>
        </NuxtLink>
      </template>
    </SidebarPanel>

    <USlideover v-model:open="open" side="left" :ui="{ content: 'max-w-xs' }">
      <template #content>
        <SidebarPanel class="border-r-0">
          <template #header>
            <div class="flex items-center justify-between">
              <h1 class="text-xl font-semibold">
                Helpinator
              </h1>
              <UButton
                icon="i-lucide-x"
                variant="ghost"
                color="neutral"
                aria-label="Close menu"
                @click="open = false"
              />
            </div>
          </template>
          <HelpinatorSidebarBody :active-widget-id="activeWidgetId" @navigated="open = false" />
          <template v-if="status?.canManage" #footer>
            <NuxtLink
              :to="widgetsPath"
              class="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-(--ui-text-muted) hover:bg-(--ui-bg-accented) hover:text-(--ui-text) transition"
            >
              <UIcon name="i-lucide-settings" class="size-4 shrink-0" />
              <span>Manage widgets</span>
            </NuxtLink>
          </template>
        </SidebarPanel>
      </template>
    </USlideover>

    <section class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <header class="flex items-center gap-2 px-4 sm:px-6 py-3 border-b border-(--ui-border) bg-(--ui-bg)">
        <UButton
          class="lg:hidden"
          icon="i-lucide-menu"
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Open sidebar"
          @click="open = true"
        />
        <h1 class="font-semibold truncate flex-1">
          {{ title }}
        </h1>
        <slot name="actions" />
      </header>
      <div class="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
        <slot />
      </div>
    </section>
  </div>
</template>
