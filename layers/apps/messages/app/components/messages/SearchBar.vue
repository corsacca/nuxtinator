<script setup lang="ts">
// Debounced search across items and comments in the org. Click result navigates
// to the conversation containing the match.

interface SearchResultItem {
  id: string
  kind: string
  conversation_id: string
  excerpt: string
  created_at: string
  author: { id: string, display_name: string }
}

interface SearchResultComment {
  id: string
  item_id: string
  conversation_id: string
  excerpt: string
  created_at: string
  author: { id: string, display_name: string }
}

const open = ref(false)
const query = ref('')
const items = ref<SearchResultItem[]>([])
const comments = ref<SearchResultComment[]>([])
const pending = ref(false)
const route = useRoute()
const router = useRouter()

let timer: ReturnType<typeof setTimeout> | null = null
let abort: AbortController | null = null

watch(query, (q) => {
  if (timer) clearTimeout(timer)
  if (!q.trim()) {
    items.value = []
    comments.value = []
    return
  }
  timer = setTimeout(() => runSearch(q.trim()), 250)
})

async function runSearch(q: string) {
  abort?.abort()
  abort = new AbortController()
  pending.value = true
  try {
    const res = await $fetch<{ items: SearchResultItem[], comments: SearchResultComment[] }>(
      '/api/messages/search',
      { query: { q }, signal: abort.signal }
    )
    items.value = res.items
    comments.value = res.comments
  } catch {
    // ignore abort
  } finally {
    pending.value = false
  }
}

function go(conversationId: string) {
  open.value = false
  query.value = ''
  const slug = route.params.orgSlug as string | undefined
  const target = slug ? `/@${slug}/messages/${conversationId}` : `/messages/${conversationId}`
  router.push(target)
}
</script>

<template>
  <UPopover v-model:open="open" :ui="{ content: 'w-96' }">
    <button class="search-btn" aria-label="Search">
      <UIcon name="i-lucide-search" class="size-4" />
      <span class="text-sm hidden sm:inline">Search</span>
    </button>
    <template #content>
      <div class="flex flex-col">
        <div class="px-3 py-2 border-b border-(--ui-border)">
          <UInput
            v-model="query"
            placeholder="Search messages and comments..."
            icon="i-lucide-search"
            autofocus
          />
        </div>
        <div class="max-h-96 overflow-y-auto">
          <div v-if="!query.trim()" class="px-3 py-4 text-center text-sm text-(--ui-text-muted)">
            Type to search.
          </div>
          <div v-else-if="pending" class="px-3 py-4 text-center text-sm text-(--ui-text-muted)">
            Searching...
          </div>
          <div v-else-if="items.length === 0 && comments.length === 0" class="px-3 py-4 text-center text-sm text-(--ui-text-muted)">
            No results.
          </div>
          <template v-else>
            <div v-if="items.length" class="px-3 pt-2 text-xs uppercase tracking-wide text-(--ui-text-muted) font-semibold">
              Messages
            </div>
            <button
              v-for="r in items"
              :key="r.id"
              class="w-full text-left px-3 py-2 hover:bg-(--ui-bg-elevated) border-b border-(--ui-border)/40"
              @click="go(r.conversation_id)"
            >
              <div class="text-xs text-(--ui-text-muted) mb-0.5">
                {{ r.author.display_name }}
              </div>
              <div class="text-sm" v-html="r.excerpt" />
            </button>
            <div v-if="comments.length" class="px-3 pt-2 text-xs uppercase tracking-wide text-(--ui-text-muted) font-semibold">
              Comments
            </div>
            <button
              v-for="r in comments"
              :key="r.id"
              class="w-full text-left px-3 py-2 hover:bg-(--ui-bg-elevated) border-b border-(--ui-border)/40"
              @click="go(r.conversation_id)"
            >
              <div class="text-xs text-(--ui-text-muted) mb-0.5">
                {{ r.author.display_name }}
              </div>
              <div class="text-sm" v-html="r.excerpt" />
            </button>
          </template>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
.search-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  color: var(--ui-text-muted);
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
}
.search-btn:hover {
  border-color: var(--ui-border-accented);
  color: var(--ui-text);
}
</style>
