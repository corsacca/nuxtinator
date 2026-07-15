<script setup lang="ts">
import type { AiAdminConfig, AiAdminModel } from '#ai'

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin']
})

const toast = useToast()

const { data, pending, refresh } = await useFetch<AiAdminConfig>('/api/ai/admin/config', {
  default: () => ({ configured: false, models: [], features: [] })
})

const configured = computed(() => data.value?.configured ?? false)
const models = computed(() => data.value?.models ?? [])
const features = computed(() => data.value?.features ?? [])
const enabledModels = computed(() => models.value.filter(m => m.enabled))

// Model options for the per-feature selectors — only enabled models are
// selectable (the server refuses a disabled model anyway).
const featureModelItems = computed(() =>
  enabledModels.value.map(m => ({ value: m.id, label: m.label }))
)

const saving = ref(false)
const newCustomId = ref('')

async function put(body: Record<string, unknown>): Promise<boolean> {
  saving.value = true
  try {
    await $fetch('/api/ai/admin/config', { method: 'PUT', body })
    await refresh()
    return true
  } catch (err: unknown) {
    toast.add({
      title: 'Update failed',
      description: (err as { data?: { statusMessage?: string } } | null)?.data?.statusMessage,
      color: 'error'
    })
    return false
  } finally {
    saving.value = false
  }
}

async function toggleModel(model: AiAdminModel, enabled: boolean) {
  const next = enabled
    ? [...enabledModels.value.map(m => m.id), model.id]
    : enabledModels.value.map(m => m.id).filter(id => id !== model.id)
  if (await put({ enabled_models: next })) {
    toast.add({ title: enabled ? `Enabled ${model.label}` : `Disabled ${model.label}`, color: 'success' })
  }
}

async function addCustomModel() {
  const id = newCustomId.value.trim()
  if (!id) return
  const custom = models.value.filter(m => m.custom).map(m => m.id)
  if (custom.includes(id) || models.value.some(m => m.id === id)) {
    toast.add({ title: 'That model is already listed', color: 'warning' })
    return
  }
  // Add it as a custom id and enable it in one write.
  const ok = await put({
    custom_models: [...custom, id],
    enabled_models: [...enabledModels.value.map(m => m.id), id]
  })
  if (ok) {
    newCustomId.value = ''
    toast.add({ title: `Added ${id}`, color: 'success' })
  }
}

async function removeCustomModel(model: AiAdminModel) {
  const custom = models.value.filter(m => m.custom && m.id !== model.id).map(m => m.id)
  const enabled = enabledModels.value.map(m => m.id).filter(id => id !== model.id)
  if (await put({ custom_models: custom, enabled_models: enabled })) {
    toast.add({ title: `Removed ${model.id}`, color: 'success' })
  }
}

async function setFeatureModel(featureKey: string, modelId: string) {
  const map: Record<string, string> = {}
  for (const f of features.value) map[f.key] = f.model
  map[featureKey] = modelId
  if (await put({ feature_models: map })) {
    toast.add({ title: 'Feature model updated', color: 'success' })
  }
}
</script>

<template>
  <div class="space-y-6">
    <header>
      <h1 class="text-2xl font-bold">
        AI
      </h1>
      <p class="text-sm text-(--ui-text-muted)">
        Choose which models are available and which model powers each AI feature.
        Models are called through OpenRouter with the deployment's
        <code>OPENROUTER_API_KEY</code>.
      </p>
    </header>

    <UAlert
      v-if="!configured"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="AI is not configured"
      description="Set OPENROUTER_API_KEY in the environment to enable live generation. Model selection is saved regardless, but requests will return a 503 until a key is present."
    />

    <section class="space-y-3">
      <div>
        <h2 class="text-lg font-semibold">
          Models
        </h2>
        <p class="text-sm text-(--ui-text-muted)">
          Enable the models this deployment may use. Add a custom OpenRouter model
          id to adopt a new model without a code change.
        </p>
      </div>

      <ul class="divide-y divide-(--ui-border) border border-(--ui-border) rounded-md">
        <li
          v-for="model in models"
          :key="model.id"
          class="flex items-center justify-between gap-3 p-4"
        >
          <div class="min-w-0">
            <div class="font-medium flex items-center gap-2 flex-wrap">
              {{ model.label }}
              <UBadge
                v-if="model.custom"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                Custom
              </UBadge>
              <UBadge
                v-if="model.supportsCaching"
                color="info"
                variant="subtle"
                size="sm"
                icon="i-lucide-database"
              >
                Prompt caching
              </UBadge>
            </div>
            <div class="text-xs text-(--ui-text-muted) font-mono">
              {{ model.id }}
            </div>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <UButton
              v-if="model.custom"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="sm"
              :disabled="saving"
              @click="removeCustomModel(model)"
            />
            <USwitch
              :model-value="model.enabled"
              :disabled="saving"
              size="lg"
              @update:model-value="(v: boolean) => toggleModel(model, v)"
            />
          </div>
        </li>
      </ul>

      <div class="flex items-center gap-2">
        <UInput
          v-model="newCustomId"
          placeholder="provider/model-id (e.g. anthropic/claude-opus-4.1)"
          class="flex-1 font-mono"
          :disabled="saving"
          @keydown.enter="addCustomModel"
        />
        <UButton
          icon="i-lucide-plus"
          :disabled="saving || !newCustomId.trim()"
          @click="addCustomModel"
        >
          Add model
        </UButton>
      </div>
    </section>

    <section
      v-if="features.length"
      class="space-y-3"
    >
      <div>
        <h2 class="text-lg font-semibold">
          Feature models
        </h2>
        <p class="text-sm text-(--ui-text-muted)">
          Pick which enabled model powers each AI feature.
        </p>
      </div>

      <ul class="divide-y divide-(--ui-border) border border-(--ui-border) rounded-md">
        <li
          v-for="feature in features"
          :key="feature.key"
          class="flex items-center justify-between gap-3 p-4"
        >
          <div class="min-w-0">
            <div class="font-medium">
              {{ feature.label }}
            </div>
            <div
              v-if="feature.description"
              class="text-xs text-(--ui-text-muted)"
            >
              {{ feature.description }}
            </div>
          </div>
          <USelectMenu
            :model-value="feature.model"
            :items="featureModelItems"
            value-key="value"
            label-key="label"
            :search="false"
            :disabled="saving || !enabledModels.length"
            variant="outline"
            size="sm"
            class="w-64 shrink-0"
            @update:model-value="(v: string) => setFeatureModel(feature.key, v)"
          />
        </li>
      </ul>
    </section>

    <div
      v-else-if="!pending"
      class="text-sm text-(--ui-text-muted)"
    >
      No AI features are registered yet. Feature layers (like the inbox) register
      the models they need here once loaded.
    </div>
  </div>
</template>
