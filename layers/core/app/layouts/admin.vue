<script setup lang="ts">
const { user } = useAuth()
const route = useRoute()
const mobileOpen = ref(false)

const { sections } = await useAdminSections()

interface NavItem {
  to: string
  label: string
  icon: string
  children?: NavItem[]
}

// Build a two-level tree from the flat section list. Sections with a
// `parent` matching another section's `path` render indented underneath
// that parent. Anything with an unknown parent path is hoisted to the
// top level so it isn't silently swallowed.
const navItems = computed<NavItem[]>(() => {
  const all = sections.value
  const validParents = new Set(all.map(s => s.path))
  const childrenByParent = new Map<string, NavItem[]>()
  for (const s of all) {
    if (s.parent && validParents.has(s.parent)) {
      const arr = childrenByParent.get(s.parent) ?? []
      arr.push({ to: s.path, label: s.title, icon: s.icon ?? 'i-lucide-circle' })
      childrenByParent.set(s.parent, arr)
    }
  }
  return all
    .filter(s => !s.parent || !validParents.has(s.parent))
    .map(s => ({
      to: s.path,
      label: s.title,
      icon: s.icon ?? 'i-lucide-circle',
      children: childrenByParent.get(s.path)
    }))
})

const isActive = (to: string) => {
  if (to === '/admin') return route.path === '/admin'
  return route.path === to || route.path.startsWith(to + '/')
}

// A parent's children show only while the user is "inside" that section —
// i.e. on the parent itself or on any of its registered children. Avoids
// permanently bloating the sidebar with sub-items the user isn't using.
const isParentExpanded = (item: NavItem) => {
  if (isActive(item.to)) return true
  return item.children?.some(c => isActive(c.to)) ?? false
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
          <div
            v-for="item in navItems"
            :key="item.to"
            class="space-y-1"
          >
            <NuxtLink
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
            <div
              v-if="item.children?.length && isParentExpanded(item)"
              class="ml-3 space-y-1 border-l border-(--ui-border) pl-2"
            >
              <NuxtLink
                v-for="child in item.children"
                :key="child.to"
                :to="child.to"
                class="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors"
                :class="isActive(child.to)
                  ? 'bg-(--ui-bg-accented) text-(--ui-text) font-medium'
                  : 'text-(--ui-text-muted) hover:bg-(--ui-bg-accented) hover:text-(--ui-text)'"
              >
                <UIcon
                  :name="child.icon"
                  class="size-4 shrink-0"
                />
                <span>{{ child.label }}</span>
              </NuxtLink>
            </div>
          </div>
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
              <div
                v-for="item in navItems"
                :key="item.to"
                class="space-y-1"
              >
                <NuxtLink
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
                <div
                  v-if="item.children?.length && isParentExpanded(item)"
                  class="ml-3 space-y-1 border-l border-(--ui-border) pl-2"
                >
                  <NuxtLink
                    v-for="child in item.children"
                    :key="child.to"
                    :to="child.to"
                    class="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors"
                    :class="isActive(child.to)
                      ? 'bg-(--ui-bg-accented) text-(--ui-text) font-medium'
                      : 'text-(--ui-text-muted) hover:bg-(--ui-bg-accented) hover:text-(--ui-text)'"
                  >
                    <UIcon
                      :name="child.icon"
                      class="size-4 shrink-0"
                    />
                    <span>{{ child.label }}</span>
                  </NuxtLink>
                </div>
              </div>
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
