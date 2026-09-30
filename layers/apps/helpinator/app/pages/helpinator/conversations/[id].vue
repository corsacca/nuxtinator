<script setup lang="ts">
// One help-chat transcript, read-only. Staff can elevate it to the inbox when
// the visitor left an email: it's assigned to them and they land in the inbox
// composer, ready to reply (the visitor gets nothing until they do).
import type { HelpinatorConversationSummary, HelpinatorTranscriptMessage } from '../../../utils/helpinator-types'
import { helpinatorErrorMessage } from '../../../utils/helpinator-types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const pathTo = useHelpinatorPath()
const toast = useToast()
const id = computed(() => String(route.params.id))

const { data: status } = useHelpinatorStatus()
const { data, error, refresh } = useFetch<{
  conversation: HelpinatorConversationSummary
  messages: HelpinatorTranscriptMessage[]
}>(() => `/api/helpinator/conversations/${id.value}`)

const conversation = computed(() => data.value?.conversation)
const confirmElevate = ref(false)
const elevating = ref(false)

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

function inboxLink(inboxId: string, reply = false): string {
  return pathTo(`/inbox/${inboxId}${reply ? '?reply=1' : ''}`)
}

async function elevate() {
  elevating.value = true
  try {
    const res = await $fetch<{ inboxConversationId: string }>(`/api/helpinator/conversations/${id.value}/elevate`, { method: 'POST' })
    confirmElevate.value = false
    await navigateTo(inboxLink(res.inboxConversationId, true))
  } catch (err) {
    toast.add({ title: 'Could not elevate', description: helpinatorErrorMessage(err), color: 'error' })
    await refresh()
  } finally {
    elevating.value = false
  }
}
</script>

<template>
  <HelpinatorShell title="Conversation" :active-widget-id="conversation?.widget_id">
    <div class="max-w-5xl mx-auto space-y-4">
      <UAlert v-if="error" color="error" variant="subtle" :title="helpinatorErrorMessage(error)" />

      <div v-if="conversation" class="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section class="space-y-3 min-w-0">
          <div
            v-for="m in data!.messages"
            :key="m.id"
            class="flex"
            :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[85%] rounded-xl px-4 py-2.5 text-sm"
              :class="m.role === 'user'
                ? 'bg-(--ui-primary) text-(--ui-bg) rounded-br-sm whitespace-pre-wrap'
                : 'bg-(--ui-bg-elevated) rounded-bl-sm'"
            >
              <template v-if="m.role === 'user'">
                {{ m.content }}
              </template>
              <template v-else>
                <HelpinatorMarkdown :text="m.content" />
                <div v-if="m.searches.length" class="mt-2 flex flex-wrap items-center gap-1">
                  <UIcon name="i-lucide-search" class="size-3.5 text-(--ui-text-dimmed)" />
                  <UBadge
                    v-for="(q, i) in m.searches"
                    :key="i"
                    color="neutral"
                    variant="soft"
                    size="sm"
                  >
                    {{ q }}
                  </UBadge>
                </div>
                <div v-if="m.pages_loaded.length" class="mt-2 flex flex-wrap items-center gap-1">
                  <UIcon name="i-lucide-book-open" class="size-3.5 text-(--ui-text-dimmed)" />
                  <UBadge
                    v-for="p in m.pages_loaded"
                    :key="p.ref"
                    color="neutral"
                    variant="outline"
                    size="sm"
                  >
                    {{ p.title }}
                  </UBadge>
                </div>
              </template>
              <p class="mt-1 text-[11px] opacity-60">
                {{ when(m.created_at) }}
              </p>
            </div>
          </div>
          <p v-if="data!.messages.length === 0" class="text-(--ui-text-muted)">
            No messages.
          </p>
        </section>

        <aside class="space-y-4">
          <UCard>
            <dl class="space-y-3 text-sm">
              <div>
                <dt class="text-(--ui-text-muted)">
                  Widget
                </dt>
                <dd>{{ conversation.widget_name }}</dd>
              </div>
              <div v-if="conversation.page_url">
                <dt class="text-(--ui-text-muted)">
                  Page
                </dt>
                <dd class="break-all">
                  <a :href="conversation.page_url" target="_blank" rel="noopener noreferrer" class="underline">{{ conversation.page_url }}</a>
                </dd>
              </div>
              <div>
                <dt class="text-(--ui-text-muted)">
                  Visitor email
                </dt>
                <dd>{{ conversation.visitor_email || 'Not given' }}</dd>
              </div>
              <div>
                <dt class="text-(--ui-text-muted)">
                  Started
                </dt>
                <dd>{{ when(conversation.created_at) }}</dd>
              </div>
              <div>
                <dt class="text-(--ui-text-muted)">
                  Last message
                </dt>
                <dd>{{ when(conversation.last_message_at) }}</dd>
              </div>
              <div v-if="conversation.ended_at">
                <dt class="text-(--ui-text-muted)">
                  Ended
                </dt>
                <dd>{{ when(conversation.ended_at) }} (the widget's libraries changed)</dd>
              </div>
              <div v-if="conversation.user_agent">
                <dt class="text-(--ui-text-muted)">
                  Browser
                </dt>
                <dd class="text-xs break-words">
                  {{ conversation.user_agent }}
                </dd>
              </div>
            </dl>
          </UCard>

          <UCard v-if="conversation.inbox_conversation_id">
            <p class="text-sm mb-3">
              {{ conversation.handoff_kind === 'staff' ? 'Elevated to the inbox' : 'The visitor asked for help' }}
              {{ when(conversation.handed_off_at) }}.
            </p>
            <UButton
              v-if="status?.inboxAvailable"
              :to="inboxLink(conversation.inbox_conversation_id)"
              icon="i-lucide-inbox"
              block
            >
              Open in inbox
            </UButton>
          </UCard>
          <UCard v-else-if="status?.canElevate">
            <p class="text-sm mb-3 text-(--ui-text-muted)">
              {{ conversation.visitor_email
                ? 'Move this conversation to the inbox, assigned to you, and write the visitor a reply.'
                : 'The visitor didn\'t leave an email, so this can\'t be sent to the inbox.' }}
            </p>
            <UButton
              :disabled="!conversation.visitor_email"
              icon="i-lucide-arrow-up-right"
              block
              @click="confirmElevate = true"
            >
              Elevate to inbox
            </UButton>
          </UCard>
        </aside>
      </div>

      <UModal v-model:open="confirmElevate" title="Elevate to inbox?">
        <template #body>
          <p class="text-sm">
            This creates an inbox conversation with the transcript, assigned to you, and opens the reply
            composer. Nothing is sent to {{ conversation?.visitor_email }} until you send your reply.
          </p>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton variant="ghost" color="neutral" @click="confirmElevate = false">
              Cancel
            </UButton>
            <UButton :loading="elevating" @click="elevate">
              Elevate and reply
            </UButton>
          </div>
        </template>
      </UModal>
    </div>
  </HelpinatorShell>
</template>
