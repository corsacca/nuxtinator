<script setup lang="ts">
// Label toggles for one thread plus "create label", which creates the label
// in Gmail for the thread's account and applies it.
import type { DropdownMenuItem } from '@nuxt/ui'

const props = defineProps<{ labels: string[], applied: string[] }>()
const emit = defineEmits<{ toggle: [label: string, on: boolean], create: [name: string] }>()

const createOpen = ref(false)
const newName = ref('')

const items = computed<DropdownMenuItem[][]>(() => {
  const toggles: DropdownMenuItem[] = props.labels.map(l => ({
    label: l,
    type: 'checkbox' as const,
    checked: props.applied.includes(l),
    onUpdateChecked: (checked: boolean) => emit('toggle', l, checked)
  }))
  const groups: DropdownMenuItem[][] = []
  if (toggles.length) groups.push(toggles)
  groups.push([{
    label: 'Create new label…',
    icon: 'i-lucide-plus',
    onSelect: () => {
      newName.value = ''
      createOpen.value = true
    }
  }])
  return groups
})

function submitCreate() {
  const name = newName.value.trim()
  if (!name) return
  createOpen.value = false
  emit('create', name)
}
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end' }"
  >
    <UButton
      icon="i-lucide-tag"
      size="xs"
      color="neutral"
      variant="ghost"
      square
      title="Labels"
    />
  </UDropdownMenu>

  <UModal
    v-model:open="createOpen"
    title="New label"
  >
    <template #body>
      <UFormField
        label="Name"
        hint="Use / to nest, e.g. Work/Projects"
      >
        <UInput
          v-model="newName"
          placeholder="Label name"
          class="w-full"
          autofocus
          @keydown.enter.prevent="submitCreate"
        />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          label="Cancel"
          variant="ghost"
          color="neutral"
          @click="createOpen = false"
        />
        <UButton
          label="Create"
          icon="i-lucide-tag"
          :disabled="!newName.trim()"
          @click="submitCreate"
        />
      </div>
    </template>
  </UModal>
</template>
