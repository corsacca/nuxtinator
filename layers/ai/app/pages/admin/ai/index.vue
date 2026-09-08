<script setup lang="ts">
import type { AiAdminConfig, AiEnabledModel, AiModelInfo } from '#ai'
import { modelMeta } from '../../../utils/ai-model-meta'

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin']
})

const toast = useToast()

const { data, pending, refresh } = await useFetch<AiAdminConfig>('/api/ai/admin/config', {
  default: () => ({ hostKeyConfigured: false, modelListAvailable: false, enabled: [], defaultModel: '', features: [] })
})
const { data: list } = await useFetch<{ models: AiModelInfo[] }>('/api/ai/models', {
  default: () => ({ models: [] })
})

const enabled = computed(() => data.value?.enabled ?? [])
const features = computed(() => data.value?.features ?? [])
const enabledIds = computed(() => enabled.value.map(m => m.id))

// Models still addable: everything OpenRouter lists that isn't enabled yet.
const addable = computed(() =>
  (list.value?.models ?? []).filter(m => !enabledIds.value.includes(m.id))
)

const saving = ref(false)
const pendingAdd = ref('')

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

async function addModel(id: string) {
  pendingAdd.value = ''
  if (!id || enabledIds.value.includes(id)) return
  if (await put({ enabled_models: [...enabledIds.value, id] })) {
    toast.add({ title: `Enabled ${id}`, color: 'success' })
  }
}

async function removeModel(model: AiEnabledModel) {
  const next = enabledIds.value.filter(id => id !== model.id)
  // Drop the default and any feature choice that pointed at it.
  const featureMap: Record<string, string> = {}
  for (const f of features.value) {
    if (f.model && f.model !== model.id) featureMap[f.key] = f.model
  }
  const body: Record<string, unknown> = { enabled_models: next, feature_models: featureMap }
  if (data.value?.defaultModel === model.id) body.default_model = ''
  if (await put(body)) {
    toast.add({ title: `Disabled ${model.name}`, color: 'success' })
  }
}

async function setDefaultModel(id: string) {
  if (await put({ default_model: id })) {
    toast.add({ title: id ? 'Default model updated' : 'Default model cleared', color: 'success' })
  }
}

async function setFeatureModel(featureKey: string, id: string) {
  const map: Record<string, string> = {}
  for (const f of features.value) {
    if (f.model) map[f.key] = f.model
  }
  if (id) map[featureKey] = id
  else delete map[featureKey]
  if (await put({ feature_models: map })) {
    toast.add({ title: 'Feature model updated', color: 'success' })
  }
}

function nameOf(id: string): string {
  return enabled.value.find(m => m.id === id)?.name ?? id
}
</script>

<template>
  <div class="space-y-6">
    <header>
      <h1 class="text-2xl font-bold">
        AI
      </h1>
      <p class="text-sm text-(--ui-text-muted)">
        Choose which OpenRouter models the host's key may run, the default
        model, and the model behind each AI feature. Organizations inherit
        these choices and can override them in their own settings.
      </p>
    </header>

    <UAlert
      v-if="!data?.hostKeyConfigured"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="No host API key"
      description="Set OPENROUTER_API_KEY in the environment to give organizations without their own key a fallback. Model choices are saved regardless."
    />

    <UAlert
      v-if="!data?.modelListAvailable"
      color="warning"
      variant="subtle"
      icon="i-lucide-cloud-off"
      title="Model list unavailable"
      description="OpenRouter's model list could not be loaded. Existing choices still work; adding models will be possible once it loads."
    />

    <section class="space-y-3">
      <div>
        <h2 class="text-lg font-semibold">
          Enabled models
        </h2>
        <p class="text-sm text-(--ui-text-muted)">
          The models the host key may spend on. Organizations using the host
          key pick from this set; organizations with their own key may pick any
          OpenRouter model.
        </p>
      </div>

      <ul
        v-if="enabled.length"
        class="divide-y divide-(--ui-border) border border-(--ui-border) rounded-md"
      >
        <li
          v-for="model in enabled"
          :key="model.id"
          class="flex items-center justify-between gap-3 p-4"
        >
          <div class="min-w-0">
            <div class="font-medium flex items-center gap-2 flex-wrap">
              {{ model.name }}
              <UBadge
                v-if="!model.available"
                color="warning"
                variant="subtle"
                size="sm"
              >
                No longer available
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
            <div
              v-if="model.available"
              class="text-xs text-(--ui-text-muted)"
            >
              {{ modelMeta(model) }}
            </div>
          </div>
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="sm"
            :disabled="saving"
            aria-label="Disable model"
            @click="removeModel(model)"
          />
        </li>
      </ul>
      <div
        v-else-if="!pending"
        class="text-sm text-(--ui-text-muted)"
      >
        No models are enabled yet. AI features stay off until at least one
        model is enabled and a default is chosen.
      </div>

      <div class="max-w-md">
        <AiModelSelect
          :model-value="pendingAdd"
          :items="addable"
          placeholder="Add a model…"
          :disabled="saving || !addable.length"
          @update:model-value="addModel"
        />
      </div>
    </section>

    <section class="space-y-3">
      <div>
        <h2 class="text-lg font-semibold">
          Default model
        </h2>
        <p class="text-sm text-(--ui-text-muted)">
          Used by any feature without its own choice.
        </p>
      </div>
      <div class="max-w-md">
        <AiModelSelect
          :model-value="data?.defaultModel ?? ''"
          :items="enabled"
          clearable
          clear-label="None"
          :disabled="saving || !enabled.length"
          @update:model-value="setDefaultModel"
        />
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
          Pick which enabled model powers each AI feature, or leave it on the default.
        </p>
      </div>

      <ul class="divide-y divide-(--ui-border) border border-(--ui-border) rounded-md">
        <li
          v-for="feature in features"
          :key="feature.key"
          class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4"
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
            <div class="text-xs text-(--ui-text-muted) mt-1">
              <template v-if="feature.effectiveModel">
                Runs on {{ nameOf(feature.effectiveModel) }}
              </template>
              <template v-else>
                No model resolves — enable a model and choose a default.
              </template>
            </div>
          </div>
          <div class="w-full sm:w-72 shrink-0">
            <AiModelSelect
              :model-value="feature.model"
              :items="enabled"
              clearable
              clear-label="Use default"
              :disabled="saving || !enabled.length"
              @update:model-value="(v: string) => setFeatureModel(feature.key, v)"
            />
          </div>
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
