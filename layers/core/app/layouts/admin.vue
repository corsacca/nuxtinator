<script setup lang="ts">
const { user } = useAuth()
const route = useRoute()
const mobileOpen = ref(false)

const { sections } = await useAdminSections()

const navItems = computed(() =>
  sections.value.map(s => ({
    to: s.path,
    label: s.title,
    icon: s.icon ?? 'i-lucide-circle'
  }))
)

const isActive = (to: string) => {
  if (to === '/admin') return route.path === '/admin'
  return route.path === to || route.path.startsWith(to + '/')
}

watch(() => route.path, () => {
  mobileOpen.value = false
})
</script>

<template>
  <div class="min-h-screen bg-(--ui-bg) text-(--ui-text)">
    <!-- Mobile top bar -->
    <header class="lg:hidden bg-(--ui-bg-elevated) border-b border-(--ui-border) py-3 px-4 sticky top-0 z-40 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <UButton
          icon="i-lucide-menu"
          variant="ghost"
          color="neutral"
          aria-label="Open menu"
          @click="mobileOpen = true"
        />
        <span class="text-lg font-semibold">Admin</span>
      </div>
      <span class="text-sm text-(--ui-text-muted) truncate max-w-[50%]">
        {{ user?.display_name || user?.email }}
      </span>
    </header>

    <div class="lg:flex">
      <!-- Desktop sidebar -->
      <aside class="hidden lg:flex lg:flex-col w-64 min-h-screen border-r border-(--ui-border) bg-(--ui-bg-elevated) sticky top-0 h-screen">
        <div class="px-6 py-5 border-b border-(--ui-border)">
          <h1 class="text-xl font-semibold">
            Admin
          </h1>
        </div>
        <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors"
            :class="isActive(item.to)
              ? 'bg-(--ui-bg-accented) text-(--ui-text) font-medium'
              : 'text-(--ui-text-muted) hover:bg-(--ui-bg-accented) hover:text-(--ui-text)'"
          >
            <UIcon
              :name="item.icon"
              class="size-5 shrink-0"
            />
            <span>{{ item.label }}</span>
          </NuxtLink>
        </nav>
        <div class="border-t border-(--ui-border) px-4 py-4 space-y-2">
          <div class="text-sm text-(--ui-text-muted) truncate">
            {{ user?.display_name || user?.email }}
          </div>
          <NuxtLink
            to="/"
            class="flex items-center gap-2 text-sm text-(--ui-text-muted) hover:text-(--ui-text) transition-colors"
          >
            <UIcon
              name="i-lucide-arrow-left"
              class="size-4"
            />
            <span>Back to app</span>
          </NuxtLink>
        </div>
      </aside>

      <!-- Mobile drawer -->
      <USlideover
        v-model:open="mobileOpen"
        side="left"
        :ui="{ content: 'max-w-xs' }"
      >
        <template #content>
          <div class="flex flex-col h-full bg-(--ui-bg-elevated)">
            <div class="px-6 py-5 border-b border-(--ui-border) flex items-center justify-between">
              <h1 class="text-xl font-semibold">
                Admin
              </h1>
              <UButton
                icon="i-lucide-x"
                variant="ghost"
                color="neutral"
                aria-label="Close menu"
                @click="mobileOpen = false"
              />
            </div>
            <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              <NuxtLink
                v-for="item in navItems"
                :key="item.to"
                :to="item.to"
                class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors"
                :class="isActive(item.to)
                  ? 'bg-(--ui-bg-accented) text-(--ui-text) font-medium'
                  : 'text-(--ui-text-muted) hover:bg-(--ui-bg-accented) hover:text-(--ui-text)'"
              >
                <UIcon
                  :name="item.icon"
                  class="size-5 shrink-0"
                />
                <span>{{ item.label }}</span>
              </NuxtLink>
            </nav>
            <div class="border-t border-(--ui-border) px-4 py-4 space-y-2">
              <div class="text-sm text-(--ui-text-muted) truncate">
                {{ user?.display_name || user?.email }}
              </div>
              <NuxtLink
                to="/"
                class="flex items-center gap-2 text-sm text-(--ui-text-muted) hover:text-(--ui-text) transition-colors"
              >
                <UIcon
                  name="i-lucide-arrow-left"
                  class="size-4"
                />
                <span>Back to app</span>
              </NuxtLink>
            </div>
          </div>
        </template>
      </USlideover>

      <main class="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <slot />
      </main>
    </div>
  </div>
</template>
