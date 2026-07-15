<script setup lang="ts">
import ProjectsSidebarList from './ProjectsSidebarList.vue'
import type { KanbanProjectModel as Project } from './types'

defineProps<{
  projects: Project[]
  inboxCounts: Record<string, number>
  selectedId: string | null
}>()

const emit = defineEmits<{
  select: [projectId: string | null]
  addProject: []
  settings: []
}>()

// Mobile drawer visibility.
const open = defineModel<boolean>('open', { default: false })

function onSelect(id: string | null) {
  emit('select', id)
  open.value = false
}

function onSettings() {
  emit('settings')
  open.value = false
}
</script>

<template>
  <!-- Desktop docked panel -->
  <SidebarPanel class="hidden lg:flex w-64 shrink-0">
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-xl font-semibold">
          Projects
        </h2>
        <UButton
          icon="i-lucide-plus"
          variant="ghost"
          color="neutral"
          size="xs"
          aria-label="New project"
          @click="emit('addProject')"
        />
      </div>
    </template>
    <ProjectsSidebarList
      :projects="projects"
      :inbox-counts="inboxCounts"
      :selected-id="selectedId"
      class="-mx-1"
      @select="onSelect"
    />
    <template #footer>
      <button
        type="button"
        class="flex items-center gap-3 px-3 py-2 -mx-1 rounded-md text-sm w-full text-left transition-colors
               text-(--ui-text-muted) hover:bg-(--ui-bg-accented) hover:text-(--ui-text)"
        @click="onSettings"
      >
        <UIcon
          name="i-lucide-settings"
          class="size-5 shrink-0"
        />
        <span>Feedback settings</span>
      </button>
    </template>
  </SidebarPanel>

  <!-- Mobile drawer -->
  <USlideover
    v-model:open="open"
    side="left"
    :ui="{ content: 'max-w-xs' }"
  >
    <template #content>
      <SidebarPanel class="border-r-0">
        <template #header>
          <div class="flex items-center justify-between">
            <h1 class="text-xl font-semibold">
              Projects
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
        <ProjectsSidebarList
          :projects="projects"
          :inbox-counts="inboxCounts"
          :selected-id="selectedId"
          @select="onSelect"
        />
        <template #footer>
          <button
            type="button"
            class="flex items-center gap-3 px-3 py-2 rounded-md text-sm w-full text-left transition-colors
                   text-(--ui-text-muted) hover:bg-(--ui-bg-accented) hover:text-(--ui-text)"
            @click="onSettings"
          >
            <UIcon
              name="i-lucide-settings"
              class="size-5 shrink-0"
            />
            <span>Feedback settings</span>
          </button>
        </template>
      </SidebarPanel>
    </template>
  </USlideover>
</template>
