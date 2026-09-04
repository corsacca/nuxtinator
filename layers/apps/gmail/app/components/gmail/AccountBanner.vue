<script setup lang="ts">
// Surfaces accounts that need attention: connection errors (with the path to
// fix them) and accounts still importing their history.
import type { GmailAccount } from '../../composables/useGmailAccounts'

const props = defineProps<{ accounts: GmailAccount[] }>()
const gmailPath = useGmailPath()

const errored = computed(() => props.accounts.filter(a => a.status === 'error'))
const importing = computed(() => props.accounts.filter(a => a.status !== 'error' && !a.backfillDone))
</script>

<template>
  <div
    v-if="errored.length || importing.length"
    class="border-b border-(--ui-border)"
  >
    <UAlert
      v-for="a in errored"
      :key="a.id"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`${a.email} is disconnected`"
      :description="a.lastError ?? undefined"
      :actions="[{ label: 'Open settings', to: gmailPath('/gmail/settings'), color: 'error', variant: 'outline', size: 'xs' }]"
      class="rounded-none"
    />
    <UAlert
      v-if="importing.length"
      color="info"
      variant="subtle"
      icon="i-lucide-download"
      :title="`Importing history for ${importing.map(a => a.email).join(', ')}`"
      description="Recent mail is already here; older mail keeps arriving in the background."
      class="rounded-none"
    />
  </div>
</template>
