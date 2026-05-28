<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const sidebarOpen = ref(false)
</script>

<template>
  <div class="flex h-[calc(100vh-57px)] -mx-4 sm:-mx-6 lg:-mx-8 -my-6 lg:-my-8">
    <ContextSidebar v-model:open="sidebarOpen" />

    <section class="flex-1 flex flex-col min-w-0 border-l-0 lg:border-l border-(--ui-border) overflow-hidden">
      <header class="flex items-center gap-2 px-3 py-2 border-b border-(--ui-border) bg-(--ui-bg)">
        <UButton
          class="lg:hidden"
          icon="i-lucide-menu"
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Open sidebar"
          @click="sidebarOpen = true"
        />
        <h1 class="font-semibold">
          Context
        </h1>
      </header>
      <div class="flex-1 grid place-items-center text-(--ui-text-muted)">
        <div class="text-center max-w-sm">
          <UIcon name="i-lucide-book-open-text" class="size-10 mb-3 opacity-50" />
          <p class="text-sm">
            Pick a portfolio from the sidebar — or create a new one with the + button.
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
