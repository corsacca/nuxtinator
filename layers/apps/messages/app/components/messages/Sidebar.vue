<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

const route = useRoute()
watch(() => route.path, () => { open.value = false })
</script>

<template>
  <!-- Desktop docked panel -->
  <SidebarPanel class="hidden lg:flex w-64 shrink-0">
    <MessagesSidebarBody />
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
              Messages
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
        <MessagesSidebarBody @navigated="open = false" />
      </SidebarPanel>
    </template>
  </USlideover>
</template>
