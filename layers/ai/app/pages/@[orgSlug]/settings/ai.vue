<script setup lang="ts">
import type { AiOrgConfig } from '#ai'

// Org-level AI settings, rendered inside the tenancy layer's settings shell
// (registered via core's org-settings-section registry). Lets an org bring its
// own OpenRouter key and choose its default and per-feature models; anything
// left unset falls through to the host's choices.

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const orgSlug = computed(() => route.params.orgSlug as string)
const toast = useToast()

const { data, pending, refresh } = await useFetch<AiOrgConfig>('/api/ai/org/config', {
  watch: [orgSlug],
  key: () => `org-ai-config-${orgSlug.value}`,
  default: (): AiOrgConfig => ({
    key: { status: 'none', last4: '' },
    hostKeyConfigured: false,
    usingOwnKey: false,
    modelListAvailable: false,
    allowedModels: [],
    defaultModel: '',
    effectiveDefaultModel: '',
    features: []
  })
})

const allowed = computed(() => data.value?.allowedModels ?? [])
const features = computed(() => data.value?.features ?? [])
const keyStatus = computed(() => data.value?.key.status ?? 'none')

const saving = ref(false)
const editingKey = ref(false)
const keyInput = ref('')

function fail(err: unknown, title: string) {
  toast.add({
    title,
    description: (err as { data?: { statusMessage?: string } } | null)?.data?.statusMessage,
    color: 'error'
  })
}

async function saveKey() {
  const key = keyInput.value.trim()
  if (!key) return
  saving.value = true
  try {
    await $fetch('/api/ai/org/key', { method: 'PUT', body: { key } })
    keyInput.value = ''
    editingKey.value = false
    await refresh()
    toast.add({ title: 'API key saved', color: 'success' })
  } catch (err: unknown) {
    fail(err, 'Key not saved')
  } finally {
    saving.value = false
  }
}

async function removeKey() {
  saving.value = true
  try {
    await $fetch('/api/ai/org/key', { method: 'DELETE' })
    editingKey.value = false
    await refresh()
    toast.add({ title: 'API key removed', color: 'success' })
  } catch (err: unknown) {
    fail(err, 'Key not removed')
  } finally {
    saving.value = false
  }
}

async function put(body: Record<string, unknown>): Promise<boolean> {
  saving.value = true
  try {
    await $fetch('/api/ai/org/config', { method: 'PUT', body })
    await refresh()
    return true
  } catch (err: unknown) {
    fail(err, 'Update failed')
    return false
  } finally {
    saving.value = false
  }
}

async function setDefaultModel(id: string) {
  if (await put({ default_model: id })) {
    toast.add({ title: id ? 'Default model updated' : 'Using the host\'s default', color: 'success' })
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
  return allowed.value.find(m => m.id === id)?.name ?? id
}
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <div class="space-y-8">
      <div>
        <h1 class="text-3xl font-bold">
          AI
        </h1>
        <p class="text-sm text-(--ui-text-muted) mt-1">
          Bring your own OpenRouter key and choose which models power this
          organization's AI features.
        </p>
      </div>

      <div
        v-if="pending && !data"
        class="text-sm text-(--ui-text-muted)"
      >
        Loading...
      </div>

      <template v-else>
        <section class="space-y-3">
          <h2 class="text-lg font-semibold">
            API key
          </h2>

          <UAlert
            v-if="keyStatus === 'undecryptable'"
            color="error"
            variant="subtle"
            icon="i-lucide-key-round"
            title="Stored key can't be read"
            description="The key saved for this organization can no longer be decrypted. Remove it and enter it again. AI features are off until then."
          />

          <div class="border border-(--ui-border) rounded-md p-4 space-y-3">
            <div class="flex items-start justify-between gap-3 flex-wrap">
              <div class="min-w-0">
                <template v-if="keyStatus === 'ok'">
                  <div class="font-medium flex items-center gap-2">
                    <UIcon
                      name="i-lucide-key-round"
                      class="size-4"
                    />
                    Your key, ending in <span class="font-mono">{{ data?.key.last4 }}</span>
                  </div>
                  <div class="text-sm text-(--ui-text-muted)">
                    AI usage is billed to this key. Any OpenRouter model can be chosen below.
                  </div>
                </template>
                <template v-else-if="keyStatus === 'none' && data?.hostKeyConfigured">
                  <div class="font-medium">
                    Using the host's key
                  </div>
                  <div class="text-sm text-(--ui-text-muted)">
                    Model choices are limited to the ones the host has enabled. Add your own key to pick any OpenRouter model.
                  </div>
                </template>
                <template v-else-if="keyStatus === 'none'">
                  <div class="font-medium">
                    No key available
                  </div>
                  <div class="text-sm text-(--ui-text-muted)">
                    The host has no API key configured. Add your own OpenRouter key to enable AI features.
                  </div>
                </template>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <UButton
                  v-if="keyStatus !== 'ok' && !editingKey"
                  icon="i-lucide-plus"
                  :disabled="saving"
                  @click="editingKey = true"
                >
                  Add key
                </UButton>
                <UButton
                  v-if="keyStatus === 'ok' && !editingKey"
                  variant="outline"
                  color="neutral"
                  :disabled="saving"
                  @click="editingKey = true"
                >
                  Replace
                </UButton>
                <UButton
                  v-if="keyStatus !== 'none'"
                  variant="ghost"
                  color="error"
                  :disabled="saving"
                  @click="removeKey"
                >
                  Remove
                </UButton>
              </div>
            </div>

            <form
              v-if="editingKey"
              class="flex items-start gap-2 flex-wrap"
              @submit.prevent="saveKey"
            >
              <UInput
                v-model="keyInput"
                type="password"
                placeholder="sk-or-…"
                autocomplete="off"
                class="flex-1 min-w-64 font-mono"
                :disabled="saving"
              />
              <UButton
                type="submit"
                :loading="saving"
                :disabled="!keyInput.trim()"
              >
                Verify and save
              </UButton>
              <UButton
                variant="ghost"
                color="neutral"
                :disabled="saving"
                @click="editingKey = false; keyInput = ''"
              >
                Cancel
              </UButton>
              <p class="basis-full text-xs text-(--ui-text-muted)">
                The key is checked against OpenRouter before it's stored, encrypted at rest, and never shown again.
              </p>
            </form>
          </div>
        </section>

        <section class="space-y-3">
          <div>
            <h2 class="text-lg font-semibold">
              Default model
            </h2>
            <p class="text-sm text-(--ui-text-muted)">
              Used by any feature without its own choice below.
              <template v-if="!data?.defaultModel && data?.effectiveDefaultModel">
                Currently the host's: {{ nameOf(data.effectiveDefaultModel) }}.
              </template>
              <template v-else-if="!data?.effectiveDefaultModel">
                Nothing resolves yet — choose one here or ask the host to set a default.
              </template>
            </p>
          </div>

          <UAlert
            v-if="!data?.modelListAvailable"
            color="warning"
            variant="subtle"
            icon="i-lucide-cloud-off"
            title="Model list unavailable"
            description="OpenRouter's model list could not be loaded. Existing choices still work."
          />

          <div class="max-w-md">
            <AiModelSelect
              :model-value="data?.defaultModel ?? ''"
              :items="allowed"
              clearable
              clear-label="Use the host's default"
              :disabled="saving || !allowed.length"
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
              Override the model behind each AI feature for this organization.
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
                    No model resolves for this feature yet.
                  </template>
                </div>
              </div>
              <div class="w-full sm:w-72 shrink-0">
                <AiModelSelect
                  :model-value="feature.model"
                  :items="allowed"
                  clearable
                  clear-label="Use default"
                  :disabled="saving || !allowed.length"
                  @update:model-value="(v: string) => setFeatureModel(feature.key, v)"
                />
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>
