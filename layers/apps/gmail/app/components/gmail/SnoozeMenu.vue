<script setup lang="ts">
// Snooze picker: Gmail's presets plus a custom date-time. Times are computed
// in the browser's timezone when the menu opens.
import type { DropdownMenuItem } from '@nuxt/ui'

const props = defineProps<{ size?: 'xs' | 'sm' | 'md', label?: string, variant?: 'ghost' | 'outline' | 'subtle' | 'solid' }>()
const emit = defineEmits<{ snooze: [at: Date] }>()

const customOpen = ref(false)
const customValue = ref('')
const customError = ref<string | null>(null)

const items = computed<DropdownMenuItem[][]>(() => [
  gmailSnoozePresets().map(p => ({
    label: p.label,
    icon: 'i-lucide-clock',
    onSelect: () => emit('snooze', p.at())
  })),
  [{
    label: 'Pick date & time…',
    icon: 'i-lucide-calendar',
    onSelect: () => {
      const d = new Date(Date.now() + 60 * 60 * 1000)
      d.setMinutes(0, 0, 0)
      const pad = (n: number) => String(n).padStart(2, '0')
      customValue.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      customError.value = null
      customOpen.value = true
    }
  }]
])

function confirmCustom() {
  const d = new Date(customValue.value)
  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
    customError.value = 'Pick a time in the future'
    return
  }
  customOpen.value = false
  emit('snooze', d)
}
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end' }"
  >
    <UButton
      icon="i-lucide-clock"
      :label="props.label"
      :size="props.size ?? 'xs'"
      color="neutral"
      :variant="props.variant ?? 'ghost'"
      :square="!props.label"
      title="Snooze"
      @click.stop
    />
  </UDropdownMenu>

  <UModal
    v-model:open="customOpen"
    title="Snooze until"
  >
    <template #body>
      <div class="space-y-3">
        <UFormField
          label="Date and time"
          :error="customError ?? undefined"
        >
          <UInput
            v-model="customValue"
            type="datetime-local"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          label="Cancel"
          variant="ghost"
          color="neutral"
          @click="customOpen = false"
        />
        <UButton
          label="Snooze"
          icon="i-lucide-clock"
          @click="confirmCustom"
        />
      </div>
    </template>
  </UModal>
</template>
