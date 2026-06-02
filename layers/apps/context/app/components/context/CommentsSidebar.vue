<script setup lang="ts">
interface Props { slug: string, sectionKey: string }
const props = defineProps<Props>()

interface CommentRow {
  id: string
  author_id: string
  author_name: string | null
  quoted_text: string
  anchor_start: number
  anchor_end: number
  content: string
  is_resolved: boolean
  anchor_stale: boolean
  created_at: string
  replies: Array<{ id: string, author_id: string, author_name: string | null, content: string, created_at: string }>
}

const includeResolved = ref(false)
const { data, refresh } = await useAsyncData(
  () => `context-comments-${props.slug}-${props.sectionKey}-${includeResolved.value}`,
  () => $fetch<{ comments: CommentRow[] }>(`/api/context/portfolios/${props.slug}/sections/${props.sectionKey}/comments?include_resolved=${includeResolved.value}`),
  { watch: [includeResolved] }
)
const comments = computed(() => data.value?.comments ?? [])

async function resolve(id: string) {
  await $fetch(
    `/api/context/portfolios/${props.slug}/sections/${props.sectionKey}/comments/${id}/resolve`,
    { method: 'POST' }
  )
  await refresh()
}
</script>

<template>
  <div class="p-3 space-y-3 overflow-auto">
    <div class="flex items-center justify-between">
      <h3 class="font-semibold">
        Comments
      </h3>
      <UCheckbox v-model="includeResolved" label="Include resolved" />
    </div>
    <p v-if="comments.length === 0" class="text-sm text-(--ui-text-muted)">
      No comments.
    </p>
    <article
      v-for="c in comments"
      :key="c.id"
      class="border border-(--ui-border) rounded p-3 space-y-2"
    >
      <div class="text-xs text-(--ui-text-muted) flex items-center gap-2">
        <span>{{ c.author_name ?? 'Unknown' }}</span>
        <span>·</span>
        <span>{{ new Date(c.created_at).toLocaleString() }}</span>
        <UBadge v-if="c.anchor_stale" color="warning" size="xs" variant="subtle">
          Stale
        </UBadge>
        <UBadge v-if="c.is_resolved" color="success" size="xs" variant="subtle">
          Resolved
        </UBadge>
      </div>
      <blockquote class="text-xs italic border-l-2 border-(--ui-border) pl-2 text-(--ui-text-muted)">
        {{ c.quoted_text }}
      </blockquote>
      <p class="text-sm whitespace-pre-wrap">
        {{ c.content }}
      </p>
      <div v-if="c.replies.length" class="space-y-1 pl-3 border-l border-(--ui-border)">
        <div v-for="r in c.replies" :key="r.id" class="text-sm">
          <span class="font-medium">{{ r.author_name ?? 'Unknown' }}:</span>
          {{ r.content }}
        </div>
      </div>
      <div v-if="!c.is_resolved" class="flex justify-end">
        <UButton variant="ghost" size="xs" @click="resolve(c.id)">
          Resolve
        </UButton>
      </div>
    </article>
  </div>
</template>
