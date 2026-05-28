<script setup lang="ts">
interface Props {
  slug: string
  sectionKey: string
  anchorStart: number
  anchorEnd: number
  quotedText: string
}
const props = defineProps<Props>()
const emit = defineEmits(['posted'])
const content = ref('')
const submitting = ref(false)

async function submit() {
  if (!content.value.trim()) return
  submitting.value = true
  try {
    await $fetch(
      `/api/context/portfolios/${props.slug}/sections/${props.sectionKey}/comments`,
      {
        method: 'POST',
        body: {
          content: content.value.trim(),
          quoted_text: props.quotedText,
          anchor_start: props.anchorStart,
          anchor_end: props.anchorEnd
        }
      }
    )
    content.value = ''
    emit('posted')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="space-y-2" @submit.prevent="submit">
    <blockquote class="text-xs italic border-l-2 border-(--ui-border) pl-2 text-(--ui-text-muted)">
      {{ quotedText }}
    </blockquote>
    <UTextarea v-model="content" placeholder="Add a comment…" :rows="3" />
    <div class="flex justify-end gap-2">
      <UButton variant="ghost" type="button" @click="emit('posted')">
        Cancel
      </UButton>
      <UButton type="submit" :loading="submitting" :disabled="!content.trim()">
        Post
      </UButton>
    </div>
  </form>
</template>
