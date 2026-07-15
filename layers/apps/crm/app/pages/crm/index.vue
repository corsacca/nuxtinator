<script setup lang="ts">
// CRM landing — there is no dashboard, so it forwards to the first visible
// record type's list. With no visible types a friendly empty state renders.
definePageMeta({ middleware: 'auth' })

const { visibleTypes, ensureTypes } = useCrmTypes()
const crmPath = useCrmPath()

const resolved = ref(false)
onMounted(async () => {
  try {
    await ensureTypes()
  } catch {
    // Fall through to the empty state; the type lists surface real errors.
  }
  const first = visibleTypes.value[0]
  if (first) {
    await navigateTo(crmPath(`/${first.key}`), { replace: true })
    return
  }
  resolved.value = true
})
</script>

<template>
  <div class="grid place-items-center py-24 text-(--ui-text-muted)">
    <div
      v-if="resolved"
      class="text-center max-w-sm space-y-3"
    >
      <UIcon
        name="i-lucide-contact"
        class="size-10 opacity-50"
      />
      <p class="text-sm">
        No record types are available yet.
      </p>
    </div>
  </div>
</template>
