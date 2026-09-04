<script setup lang="ts">
// The mail client: rail · thread list · thread. Selection rides the route
// (/gmail/:id) so threads are linkable; list state (view/label/account/
// search) lives in the URL query.
import type { GmailMessageView, GmailThreadAction } from '../../composables/useGmailThread'
import type { GmailDraft } from '../../composables/useGmailCompose'

definePageMeta({ middleware: 'auth' })
defineOptions({ name: 'GmailMailPage' })

const route = useRoute()
const router = useRouter()
const gmailPath = useGmailPath()
const toast = useToast()

const selectedId = computed(() => {
  const raw = route.params.id
  const id = Array.isArray(raw) ? raw[0] : raw
  return id || null
})

const { accounts, loaded: accountsLoaded, refresh: refreshAccounts, selfAddresses, order: accountOrder, byId: accountsById } = useGmailAccounts()
const list = useGmailThreads()
const { paths: labelPaths, labels: allLabels, refresh: refreshLabels } = useGmailLabels()
const thread = useGmailThread(selectedId)
const compose = useGmailCompose()
const draftsStore = useGmailDrafts()

onMounted(() => {
  refreshAccounts()
})

const viewHeading = computed(() => {
  if (list.gq.value) return `Results for "${list.gq.value}"`
  if (list.label.value) return list.label.value
  const names: Record<string, string> = { inbox: 'Inbox', starred: 'Starred', snoozed: 'Snoozed', sent: 'Sent', drafts: 'Drafts', spam: 'Spam', trash: 'Trash', all: 'All Mail' }
  return names[list.view.value] ?? 'Mail'
})

// Labels the open thread's account actually has (label writes go to Gmail).
const threadLabels = computed(() => {
  const accountId = thread.detail.value?.thread.accountId
  if (!accountId) return labelPaths.value
  return allLabels.value.filter(l => l.accountId === accountId).map(l => l.path).sort((a, b) => a.localeCompare(b))
})

watch(() => list.view.value, (v) => {
  if (v === 'drafts') draftsStore.refresh()
}, { immediate: true })

function open(id: string) {
  router.push({ path: gmailPath(`/gmail/${id}`), query: route.query })
}

function closeThread() {
  router.push({ path: gmailPath('/gmail'), query: route.query })
}

// Opening a thread with unread mail marks it read, like Gmail.
watch(() => thread.detail.value?.thread.id, async (id) => {
  const d = thread.detail.value
  if (!id || !d || d.thread.unreadCount === 0) return
  try {
    await thread.act('mark_read')
    list.patch(id, { unreadCount: 0 })
    for (const m of d.messages) m.isUnread = false
    list.refresh({ silent: true })
  } catch {
    // A failed read-receipt is harmless; the next sync pass reconciles.
  }
})

// Whether an action removes the thread from the view it was acted on in.
function leavesView(action: GmailThreadAction): boolean {
  const v = list.view.value
  if (v === 'inbox') return ['archive', 'trash', 'spam', 'snooze', 'delete_forever'].includes(action)
  if (v === 'snoozed') return action === 'unsnooze' || action === 'trash' || action === 'spam'
  if (v === 'starred') return action === 'unstar' || action === 'trash' || action === 'spam'
  if (v === 'trash') return action === 'untrash' || action === 'delete_forever'
  if (v === 'spam') return action === 'not_spam' || action === 'delete_forever'
  if (list.label.value) return action === 'remove_label' || action === 'trash' || action === 'spam'
  return action === 'trash' || action === 'spam' || action === 'delete_forever'
}

function actionToast(action: GmailThreadAction) {
  const text: Partial<Record<GmailThreadAction, string>> = {
    archive: 'Archived',
    trash: 'Moved to trash',
    spam: 'Reported as spam',
    snooze: 'Snoozed',
    unsnooze: 'Unsnoozed',
    delete_forever: 'Deleted forever',
    untrash: 'Moved to inbox',
    not_spam: 'Moved to inbox',
    move_to_inbox: 'Moved to inbox'
  }
  const t = text[action]
  if (t) toast.add({ title: t, duration: 2000 })
}

async function onRowAction(id: string, action: GmailThreadAction, opts?: { wakeAt?: Date }) {
  try {
    await thread.actOn(id, action, opts)
    if (leavesView(action)) {
      list.drop(id)
      if (selectedId.value === id) closeThread()
    }
    actionToast(action)
    await list.refresh({ silent: true })
    if (selectedId.value === id) await thread.refresh()
  } catch (err) {
    toast.add({ title: 'Action failed', description: gmailErrorMessage(err), color: 'error' })
  }
}

async function onThreadAction(action: GmailThreadAction, opts?: { label?: string, wakeAt?: Date }) {
  const id = selectedId.value
  if (!id) return
  try {
    await thread.act(action, opts)
    actionToast(action)
    if (leavesView(action)) {
      list.drop(id)
      closeThread()
      await list.refresh({ silent: true })
      return
    }
    await Promise.all([thread.refresh(), list.refresh({ silent: true })])
  } catch (err) {
    toast.add({ title: 'Action failed', description: gmailErrorMessage(err), color: 'error' })
  }
}

async function onCreateLabel(name: string) {
  try {
    await thread.act('add_label', { label: name })
    await Promise.all([refreshLabels(), thread.refresh(), list.refresh({ silent: true })])
  } catch (err) {
    toast.add({ title: 'Could not create label', description: gmailErrorMessage(err), color: 'error' })
  }
}

async function onReply(message: GmailMessageView, mode: 'reply' | 'reply_all' | 'forward') {
  const d = thread.detail.value
  if (!d) return
  const account = accountsById.value.get(d.thread.accountId)
  try {
    await compose.start(gmailReplySeed(d, message, mode, selfAddresses.value), account?.signatureHtml)
  } catch (err) {
    toast.add({ title: 'Could not start reply', description: gmailErrorMessage(err), color: 'error' })
  }
}

async function onCompose() {
  const accountId = list.account.value || accounts.value[0]?.id
  if (!accountId) return
  const account = accountsById.value.get(accountId)
  try {
    await compose.start({ mode: 'new', accountId }, account?.signatureHtml)
  } catch (err) {
    toast.add({ title: 'Could not start a draft', description: gmailErrorMessage(err), color: 'error' })
  }
}

async function onOpenDraft(d: GmailDraft) {
  await compose.resume(d)
}

async function onRemoveDraft(id: string) {
  try {
    await draftsStore.remove(id)
    await list.refresh({ silent: true })
  } catch (err) {
    toast.add({ title: 'Could not discard draft', description: gmailErrorMessage(err), color: 'error' })
  }
}

// Closing the composer (after send or close) refreshes the Drafts view and
// counts so the rail badge is right.
watch(() => compose.open.value, (v) => {
  if (!v) {
    if (list.view.value === 'drafts') draftsStore.refresh()
    list.refresh({ silent: true })
  }
})
</script>

<template>
  <div class="flex h-[calc(100vh-57px)] -mx-4 sm:-mx-6 lg:-mx-8 -my-6 lg:-my-8">
    <GmailFolderRail
      v-model:view="list.view.value"
      v-model:label="list.label.value"
      v-model:account="list.account.value"
      :counts="list.counts.value"
      :labels="labelPaths"
      :accounts="accounts"
      @compose="onCompose"
    />

    <section class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <GmailAccountBanner :accounts="accounts" />

      <div
        v-if="accountsLoaded && !accounts.length"
        class="flex-1 flex items-center justify-center p-8"
      >
        <UEmpty
          icon="i-lucide-mail"
          title="No Gmail account connected"
          description="Connect one or more Gmail accounts with an app password to see them here."
          :actions="[{ label: 'Connect an account', icon: 'i-lucide-plug', to: gmailPath('/gmail/settings') }]"
        />
      </div>

      <div
        v-else
        class="flex-1 flex min-w-0 overflow-hidden"
      >
        <GmailDraftsList
          v-if="list.view.value === 'drafts'"
          :drafts="draftsStore.drafts.value"
          :pending="draftsStore.pending.value"
          @open="onOpenDraft"
          @remove="onRemoveDraft"
        />
        <GmailThreadList
          v-else
          v-model:q="list.q.value"
          v-model:gq="list.gq.value"
          v-model:page="list.page.value"
          :items="list.items.value"
          :total="list.total.value"
          :pending="list.pending.value"
          :error="list.error.value"
          :heading="viewHeading"
          :selected-id="selectedId"
          :account-order="accountOrder"
          :self-addresses="selfAddresses"
          :view="list.view.value"
          :page-size="list.pageSize"
          @select="open"
          @action="onRowAction"
          @refresh="list.refresh()"
        />

        <GmailThreadView
          :detail="thread.detail.value"
          :pending="thread.pending.value"
          :error="thread.error.value"
          :body-pending="thread.bodyPending.value"
          :self-addresses="selfAddresses"
          :labels="threadLabels"
          :account-email="thread.detail.value?.thread.accountEmail ?? null"
          :show-account="accounts.length > 1"
          @action="onThreadAction"
          @reply="onReply"
          @load-body="thread.loadBody"
          @create-label="onCreateLabel"
        />
      </div>
    </section>

    <GmailComposeModal
      :compose="compose"
      :accounts="accounts"
    />
  </div>
</template>
