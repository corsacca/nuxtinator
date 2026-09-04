<script setup lang="ts">
// Folder rail: compose, the fixed views, user labels, and the account filter.
// View, label and account are competing list dimensions owned by the URL
// query (see useGmailThreads).
import type { GmailCounts, GmailViewKey } from '../../composables/useGmailThreads'
import type { GmailAccount } from '../../composables/useGmailAccounts'

const props = defineProps<{
  counts: GmailCounts | null
  labels: string[]
  accounts: GmailAccount[]
}>()

const view = defineModel<GmailViewKey>('view', { required: true })
const label = defineModel<string>('label', { required: true })
const account = defineModel<string>('account', { required: true })
const emit = defineEmits<{ compose: [] }>()

const gmailPath = useGmailPath()

const folders = computed(() => [
  { key: 'inbox' as const, label: 'Inbox', icon: 'i-lucide-inbox', count: props.counts?.inboxUnread ?? 0, alert: true },
  { key: 'starred' as const, label: 'Starred', icon: 'i-lucide-star', count: 0 },
  { key: 'snoozed' as const, label: 'Snoozed', icon: 'i-lucide-clock', count: props.counts?.snoozed ?? 0 },
  { key: 'sent' as const, label: 'Sent', icon: 'i-lucide-send', count: 0 },
  { key: 'drafts' as const, label: 'Drafts', icon: 'i-lucide-file-pen-line', count: props.counts?.drafts ?? 0 },
  { key: 'spam' as const, label: 'Spam', icon: 'i-lucide-shield-alert', count: props.counts?.spamUnread ?? 0 },
  { key: 'trash' as const, label: 'Trash', icon: 'i-lucide-trash-2', count: 0 },
  { key: 'all' as const, label: 'All Mail', icon: 'i-lucide-mails', count: 0 }
])

const unreadByAccount = computed(() => new Map((props.counts?.perAccount ?? []).map(p => [p.accountId, p.inboxUnread])))
const accountOrder = computed(() => props.accounts.map(a => a.id))

function selectLabel(path: string) {
  label.value = label.value === path ? '' : path
}

const itemClass = 'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-left transition-colors'
const activeClass = 'bg-(--ui-bg-accented) text-(--ui-text-highlighted)'
const idleClass = 'text-(--ui-text-muted) hover:bg-(--ui-bg-accented)/50'
</script>

<template>
  <SidebarPanel class="w-56 shrink-0">
    <template #header>
      <UButton
        label="Compose"
        icon="i-lucide-pencil"
        block
        :disabled="!accounts.length"
        @click="emit('compose')"
      />
    </template>

    <nav class="space-y-0.5">
      <button
        v-for="folder in folders"
        :key="folder.key"
        type="button"
        :class="[itemClass, !label && view === folder.key ? activeClass : idleClass]"
        @click="view = folder.key"
      >
        <UIcon
          :name="folder.icon"
          class="size-4 shrink-0"
        />
        <span class="flex-1 truncate">{{ folder.label }}</span>
        <UBadge
          v-if="folder.count > 0"
          :label="folder.count"
          size="sm"
          variant="subtle"
          :color="folder.alert ? 'primary' : 'neutral'"
        />
      </button>

      <template v-if="labels.length">
        <p class="px-3 pt-3 pb-1 text-xs font-medium text-(--ui-text-dimmed) uppercase tracking-wide">
          Labels
        </p>
        <button
          v-for="path in labels"
          :key="path"
          type="button"
          :class="[itemClass, label === path ? activeClass : idleClass]"
          @click="selectLabel(path)"
        >
          <UIcon
            name="i-lucide-tag"
            class="size-4 shrink-0"
          />
          <span class="flex-1 truncate">{{ path }}</span>
        </button>
      </template>

      <template v-if="accounts.length > 1">
        <p class="px-3 pt-3 pb-1 text-xs font-medium text-(--ui-text-dimmed) uppercase tracking-wide">
          Accounts
        </p>
        <button
          type="button"
          :class="[itemClass, !account ? activeClass : idleClass]"
          @click="account = ''"
        >
          <UIcon
            name="i-lucide-layers"
            class="size-4 shrink-0"
          />
          <span class="flex-1 truncate">All accounts</span>
        </button>
        <button
          v-for="a in accounts"
          :key="a.id"
          type="button"
          :class="[itemClass, account === a.id ? activeClass : idleClass]"
          :title="a.email"
          @click="account = a.id"
        >
          <span
            class="size-2.5 shrink-0 rounded-full"
            :style="{ backgroundColor: `var(--ui-${gmailAccountColor(a.id, accountOrder)})` }"
          />
          <span class="flex-1 truncate">{{ a.email }}</span>
          <UIcon
            v-if="a.status === 'error'"
            name="i-lucide-triangle-alert"
            class="size-4 text-(--ui-error) shrink-0"
          />
          <UBadge
            v-else-if="(unreadByAccount.get(a.id) ?? 0) > 0"
            :label="unreadByAccount.get(a.id)"
            size="sm"
            variant="subtle"
            color="neutral"
          />
        </button>
      </template>
    </nav>

    <template #footer>
      <NuxtLink
        :to="gmailPath('/gmail/settings')"
        class="flex items-center gap-2 text-sm text-(--ui-text-muted) hover:text-(--ui-text) transition-colors"
      >
        <UIcon
          name="i-lucide-settings"
          class="size-4 shrink-0"
        />
        Accounts &amp; settings
      </NuxtLink>
    </template>
  </SidebarPanel>
</template>
