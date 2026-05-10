<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})
</script>

<template>
  <div class="flex h-[calc(100vh-160px)] lg:h-[calc(100vh-130px)] gap-4">
    <MessagesSidebar />

    <section class="flex-1 flex flex-col min-w-0 border border-(--ui-border) rounded-lg overflow-hidden">
      <header class="flex items-center justify-end gap-2 px-3 py-2 border-b border-(--ui-border) bg-(--ui-bg)">
        <MessagesSearchBar />
        <MessagesNotificationBell />
      </header>

      <div class="flex-1 grid place-items-center text-(--ui-text-muted)">
        <div class="text-center max-w-sm">
          <UIcon name="i-lucide-message-square" class="size-10 mb-3 opacity-50" />
          <p class="text-sm">
            Pick a channel or DM from the sidebar — or create one.
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
