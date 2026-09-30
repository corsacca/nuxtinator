<script setup lang="ts">
import type { AiOrgConfig, AiModelInfo, AiEmbeddingModelInfo, AiReindexStatus } from '#ai'

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
    features: [],
    embeddingAvailable: false,
    embeddingModels: [],
    embeddingModel: '',
    effectiveEmbeddingModel: '',
    embeddingStale: false,
    embeddingStoredModels: []
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

// ---- Embedding model ----------------------------------------------------

const embeddingItems = computed<AiModelInfo[]>(() => (data.value?.embeddingModels ?? []).map((m: AiEmbeddingModelInfo): AiModelInfo => ({
  id: m.id,
  name: m.name,
  promptPrice: m.promptPrice,
  completionPrice: null,
  contextLength: m.contextLength,
  supportsTemperature: false,
  supportsCaching: false
})))
function embeddingNameOf(id: string): string {
  return embeddingItems.value.find((m: AiModelInfo) => m.id === id)?.name ?? id
}
const confirmEmbedding = ref<string | null>(null)

async function setEmbeddingModel(id: string) {
  confirmEmbedding.value = null
  if (await put({ embedding_model: id })) {
    toast.add({ title: id ? 'Embedding model updated' : 'Using the host\'s embedding model', color: 'success' })
  }
}
function onPickEmbedding(id: string) {
  if (id === (data.value?.embeddingModel ?? '')) return
  if (data.value?.embeddingStoredModels.length) confirmEmbedding.value = id
  else setEmbeddingModel(id)
}

const reindex = ref<AiReindexStatus | null>(null)
const reindexing = computed(() => reindex.value?.running === true)
let reindexTimer: ReturnType<typeof setTimeout> | null = null
async function pollReindex() {
  try {
    reindex.value = await $fetch<AiReindexStatus>('/api/ai/org/reindex-status')
  } catch {
    return
  }
  if (reindex.value?.running) reindexTimer = setTimeout(pollReindex, 2000)
  else await refresh()
}
async function startReindex() {
  try {
    const res = await $fetch<{ started: boolean, reason: string | null, status: AiReindexStatus }>('/api/ai/org/reindex', { method: 'POST' })
    reindex.value = res.status
    if (!res.started) toast.add({ title: 'A rebuild is already running', color: 'warning' })
    await pollReindex()
  } catch (err: unknown) {
    fail(err, 'Could not start the rebuild')
  }
}
onBeforeUnmount(() => {
  if (reindexTimer) clearTimeout(reindexTimer)
})
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

        <section
          v-if="data?.embeddingAvailable"
          class="space-y-3"
        >
          <div>
            <h2 class="text-lg font-semibold">
              Embedding model
            </h2>
            <p class="text-sm text-(--ui-text-muted)">
              Builds this organization's search indexes (help libraries, portfolio sections).
              <template v-if="!data?.embeddingModel && data?.effectiveEmbeddingModel">
                Currently the host's: {{ embeddingNameOf(data.effectiveEmbeddingModel) }}.
              </template>
              <template v-else-if="!data?.effectiveEmbeddingModel">
                Nothing resolves yet — search stays off until one is chosen here or by the host.
              </template>
            </p>
          </div>

          <div class="max-w-md">
            <AiModelSelect
              :model-value="data?.embeddingModel ?? ''"
              :items="embeddingItems"
              clearable
              clear-label="Use the host's embedding model"
              :disabled="saving || reindexing || !embeddingItems.length"
              @update:model-value="onPickEmbedding"
            />
          </div>

          <UAlert
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="Changing this makes the existing search indexes unusable until they are rebuilt"
            description="Vectors from different models cannot be compared. After a change, re-embed this organization's indexes with the button that appears below."
          />

          <UAlert
            v-if="data?.embeddingStale && !reindexing"
            color="error"
            variant="subtle"
            icon="i-lucide-database-zap"
            title="The search indexes were built with another model"
          >
            <template #description>
              <p class="mb-2">
                Search returns nothing useful until they are rebuilt with {{ embeddingNameOf(data.effectiveEmbeddingModel) }}.
              </p>
              <UButton
                size="sm"
                color="error"
                icon="i-lucide-refresh-cw"
                :disabled="saving"
                @click="startReindex"
              >
                Re-embed this organization's indexes
              </UButton>
            </template>
          </UAlert>

          <div
            v-if="reindex"
            class="text-sm border border-(--ui-border) rounded-md p-3 flex items-center gap-2"
          >
            <UIcon
              :name="reindexing ? 'i-lucide-loader-circle' : 'i-lucide-check'"
              class="size-4"
              :class="{ 'animate-spin': reindexing }"
            />
            <span v-if="reindexing">
              Rebuilding{{ reindex.scopes[0]?.current ? ` ${reindex.scopes[0].current}` : '' }}…
              {{ reindex.scopes[0]?.items ?? 0 }} of {{ reindex.scopes[0]?.total ?? 0 }} items,
              {{ reindex.scopes[0]?.chunks ?? 0 }} chunks
            </span>
            <span v-else>
              Rebuild finished — {{ reindex.scopes.reduce((n, s) => n + s.chunks, 0) }} chunks
              <span
                v-if="reindex.scopes.some(s => s.error)"
                class="text-(--ui-error)"
              >({{ reindex.scopes.find(s => s.error)?.error }})</span>
            </span>
          </div>
        </section>
      </template>
    </div>

    <UModal
      :open="confirmEmbedding !== null"
      title="Change the embedding model?"
      @update:open="(v: boolean) => { if (!v) confirmEmbedding = null }"
    >
      <template #body>
        <p class="text-sm">
          This organization's search indexes stop matching until they are re-embedded.
          You can start the rebuild right after saving.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            variant="ghost"
            color="neutral"
            @click="confirmEmbedding = null"
          >
            Cancel
          </UButton>
          <UButton
            color="warning"
            @click="setEmbeddingModel(confirmEmbedding ?? '')"
          >
            Change model
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
