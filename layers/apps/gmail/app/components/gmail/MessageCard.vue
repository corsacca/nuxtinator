<script setup lang="ts">
// One message in a thread: collapsible header, the body frame once fetched,
// and attachment chips that download through the authenticated proxy.
import type { GmailMessageView } from '../../composables/useGmailThread'

const props = defineProps<{
  message: GmailMessageView
  expanded: boolean
  bodyPending: boolean
  selfAddresses: Set<string>
}>()

const emit = defineEmits<{ toggle: [], reply: [mode: 'reply' | 'reply_all' | 'forward'] }>()

const from = computed(() => props.message.fromAddr ? { name: props.message.fromName, address: props.message.fromAddr } : null)
const fromLabel = computed(() => gmailDisplayName(from.value, props.selfAddresses) || '(unknown sender)')
const toLine = computed(() => {
  const names = props.message.to.map(a => gmailDisplayName(a, props.selfAddresses))
  return names.length ? `to ${names.join(', ')}` : ''
})
const ccLine = computed(() => props.message.cc.map(a => gmailDisplayName(a, props.selfAddresses)).join(', '))
const initial = computed(() => (fromLabel.value.trim()[0] ?? '?').toUpperCase())
const files = computed(() => props.message.attachments.filter(a => !a.inline))
const showDetails = ref(false)
</script>

<template>
  <div
    class="rounded-lg border border-(--ui-border) bg-(--ui-bg)"
    :class="message.isUnread ? 'border-l-2 border-l-(--ui-primary)' : ''"
  >
    <button
      type="button"
      class="w-full flex items-start gap-3 px-3 py-2.5 text-left"
      @click="emit('toggle')"
    >
      <UAvatar
        :text="initial"
        size="sm"
        class="shrink-0 mt-0.5"
      />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span
            class="truncate text-sm"
            :class="message.isUnread ? 'font-semibold text-(--ui-text-highlighted)' : 'font-medium text-(--ui-text)'"
          >{{ fromLabel }}</span>
          <span
            v-if="from?.name && expanded"
            class="truncate text-xs text-(--ui-text-dimmed)"
          >&lt;{{ from.address }}&gt;</span>
          <UIcon
            v-if="message.isStarred"
            name="i-lucide-star"
            class="size-3.5 text-(--ui-warning) shrink-0"
          />
          <UIcon
            v-if="message.hasAttachments && !expanded"
            name="i-lucide-paperclip"
            class="size-3.5 text-(--ui-text-dimmed) shrink-0"
          />
          <span
            class="ml-auto shrink-0 text-xs text-(--ui-text-dimmed)"
            :title="gmailFullDate(message.internalDate)"
          >{{ expanded ? gmailFullDate(message.internalDate) : gmailListDate(message.internalDate) }}</span>
        </div>
        <div
          v-if="expanded"
          class="text-xs text-(--ui-text-muted) truncate"
        >
          {{ toLine }}
          <button
            v-if="message.cc.length || message.to.length > 1"
            type="button"
            class="ml-1 underline decoration-dotted"
            @click.stop="showDetails = !showDetails"
          >
            details
          </button>
        </div>
        <div
          v-else
          class="text-xs text-(--ui-text-dimmed) truncate"
        >
          {{ message.snippet }}
        </div>
        <div
          v-if="expanded && showDetails"
          class="mt-1 text-xs text-(--ui-text-muted) space-y-0.5"
        >
          <div>To: {{ gmailFormatAddressLine(message.to) }}</div>
          <div v-if="message.cc.length">
            Cc: {{ ccLine }}
          </div>
          <div
            v-if="message.messageId"
            class="truncate"
          >
            Message-ID: {{ message.messageId }}
          </div>
        </div>
      </div>
    </button>

    <div
      v-if="expanded"
      class="px-3 pb-3"
    >
      <div
        v-if="!message.bodyFetched"
        class="space-y-2 py-2"
      >
        <USkeleton class="h-3 w-3/4" />
        <USkeleton class="h-3 w-full" />
        <USkeleton class="h-3 w-5/6" />
      </div>
      <GmailMessageBody
        v-else
        :html="message.bodyHtml"
        :text="message.bodyText"
      />

      <div
        v-if="files.length"
        class="mt-3 flex flex-wrap gap-2"
      >
        <a
          v-for="a in files"
          :key="a.index"
          :href="`/api/gmail/messages/${message.id}/attachments/${a.index}`"
          class="inline-flex items-center gap-1.5 rounded-md border border-(--ui-border) px-2 py-1 text-xs text-(--ui-text) hover:bg-(--ui-bg-elevated)"
          download
        >
          <UIcon
            name="i-lucide-paperclip"
            class="size-3.5 text-(--ui-text-dimmed)"
          />
          <span class="truncate max-w-48">{{ a.filename || 'attachment' }}</span>
          <span class="text-(--ui-text-dimmed)">{{ gmailFileSize(a.size) }}</span>
        </a>
      </div>

      <div class="mt-3 flex items-center gap-1">
        <UButton
          label="Reply"
          icon="i-lucide-reply"
          size="xs"
          color="neutral"
          variant="outline"
          @click="emit('reply', 'reply')"
        />
        <UButton
          label="Reply all"
          icon="i-lucide-reply-all"
          size="xs"
          color="neutral"
          variant="ghost"
          @click="emit('reply', 'reply_all')"
        />
        <UButton
          label="Forward"
          icon="i-lucide-forward"
          size="xs"
          color="neutral"
          variant="ghost"
          @click="emit('reply', 'forward')"
        />
      </div>
    </div>
  </div>
</template>
