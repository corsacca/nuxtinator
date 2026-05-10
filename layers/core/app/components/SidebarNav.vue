<script setup lang="ts">
import type { SidebarNavItem } from '#core/app/utils/sidebar-nav'

defineProps<{
  items: SidebarNavItem[]
}>()

const route = useRoute()

const isActive = (item: SidebarNavItem) => {
  if (item.exact) return route.path === item.to
  return route.path === item.to || route.path.startsWith(item.to + '/')
}

const isParentExpanded = (item: SidebarNavItem) => {
  if (isActive(item)) return true
  return item.children?.some(c => isActive(c)) ?? false
}
</script>

<template>
  <nav class="flex flex-col gap-1">
    <div
      v-for="item in items"
      :key="item.to"
      class="space-y-1"
    >
      <NuxtLink
        :to="item.to"
        class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors"
        :class="isActive(item)
          ? 'bg-(--ui-bg-accented) text-(--ui-text) font-medium'
          : 'text-(--ui-text-muted) hover:bg-(--ui-bg-accented) hover:text-(--ui-text)'"
      >
        <UIcon
          :name="item.icon"
          class="size-5 shrink-0"
        />
        <span class="flex-1 truncate">{{ item.label }}</span>
        <slot
          name="trailing"
          :item="item"
        />
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
          :class="isActive(child)
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
</template>
