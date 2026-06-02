<script setup lang="ts">
interface Props {
  portfolio: {
    id: string
    slug: string
    name: string
    color: string | null
    icon_url: string | null
    updated_at: string
  }
}
const props = defineProps<Props>()
defineEmits(['deleted'])
const stripeStyle = computed(() => ({ background: props.portfolio.color ?? '#7c3aed' }))
</script>

<template>
  <NuxtLink
    :to="`/context/${portfolio.slug}`"
    class="block border border-(--ui-border) rounded-lg overflow-hidden hover:border-(--ui-border-accented) bg-(--ui-bg-elevated)"
  >
    <div class="h-2" :style="stripeStyle" />
    <div class="p-4 flex items-start gap-3">
      <img v-if="portfolio.icon_url" :src="portfolio.icon_url" alt="" class="size-10 rounded object-cover">
      <div class="size-10 rounded grid place-items-center bg-(--ui-bg)" v-else>
        <UIcon name="i-lucide-book-open-text" class="size-5 text-(--ui-text-muted)" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-medium truncate">
          {{ portfolio.name }}
        </div>
        <div class="text-xs text-(--ui-text-muted)">
          Updated {{ new Date(portfolio.updated_at).toLocaleDateString() }}
        </div>
      </div>
    </div>
  </NuxtLink>
</template>
