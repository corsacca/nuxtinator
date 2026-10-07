import { createError } from 'h3'
import { getSetting, setSetting, getHostSetting } from '#core/server/utils/settings-store'
import { encryptSecret, decryptSecret } from '#core/server/utils/secret-crypto'
import type { AiDbClient } from '#core/ai-fallback/types'
import type { AiFeatureKind, AiProvider, AiProviderModelInfo } from '../../types/ai-ext'
import { getHostApiKey, getTinfoilConfig } from './ai-config'
import { getAllModels, getModelInfo, isKnownModel } from './ai-model-list'
import { getEmbeddingModelList, isKnownEmbeddingModel } from './ai-embedding-model-list'
import { getAiFeatureKind } from './ai-feature-registry'
import { providerOf } from './ai-provider'

// The DB-backed half of the AI layer's config, in two scopes that stack:
//
//   host (`core_host_settings`, deployment-global; edited on /admin/ai):
//     enabled_models — the models the host's own key may spend on
//     default_model  — fallback for any feature without a host choice
//     feature_models — `{ [featureKey]: modelId }`
//
//   org (`core_settings`, RLS-scoped to the active org; edited on the org's
//   settings page):
//     api_key        — the org's own OpenRouter key, encrypted at rest
//     default_model  — the org's fallback, overriding the host's
//     feature_models — the org's per-feature choices, overriding the host's
//
// Resolution for a feature walks org choice → org default → host choice →
// host default, skipping any model the org may not use right now. What an org
// may use depends on whose key pays: on the host's key only the host-enabled
// set; on its own key any model OpenRouter lists plus the host-enabled Tinfoil
// models (Tinfoil always runs on the host's key).
//
// Features have a kind. Chat features walk the full chain above; transcription
// features walk only the feature choices (org, then host), since the default
// model is a chat model. A candidate of the wrong kind is skipped.
//
// Every read merges code-owned defaults with stored overrides through core's
// settings store; the registrations live in register-ai.ts. Callers pass the
// request `tx` so RLS scopes the org rows.

export const AI_SETTINGS_NAMESPACE = 'ai'
export const AI_SETTING_ENABLED_MODELS = 'enabled_models'
export const AI_SETTING_DEFAULT_MODEL = 'default_model'
export const AI_SETTING_FEATURE_MODELS = 'feature_models'
export const AI_SETTING_API_KEY = 'api_key'
export const AI_SETTING_EMBEDDING_MODEL = 'embedding_model'

// Turn a raw (possibly bad) stored value into a clean string[] of ids.
export function sanitizeModelIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of value) {
    if (typeof v !== 'string') continue
    const id = v.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function sanitizeModelId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// Turn a raw stored value into a clean `{ featureKey: modelId }` map.
export function sanitizeFeatureModels(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k === 'string' && k.length > 0 && typeof v === 'string' && v.trim().length > 0) {
      out[k] = v.trim()
    }
  }
  return out
}

// --- Org API key ---

export type AiOrgKeyStatus = 'none' | 'ok' | 'undecryptable'

export interface AiOrgKey {
  status: AiOrgKeyStatus
  // Plaintext key when status is 'ok'; otherwise ''.
  key: string
  last4: string
}

// The active org's stored key. 'undecryptable' means a row exists but the
// deployment's secret-encryption key no longer opens it (rotated); the org
// must remove and re-enter it.
export async function getOrgApiKey(tx: AiDbClient): Promise<AiOrgKey> {
  const stored = await getSetting<string>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_API_KEY)
  if (!stored) return { status: 'none', key: '', last4: '' }
  try {
    const key = decryptSecret(stored)
    return { status: 'ok', key, last4: key.slice(-4) }
  } catch {
    return { status: 'undecryptable', key: '', last4: '' }
  }
}

// Store (encrypted) or clear ('' ) the active org's key.
export async function setOrgApiKey(tx: AiDbClient, key: string): Promise<void> {
  let stored = ''
  if (key) {
    try {
      stored = encryptSecret(key)
    } catch (err) {
      throw createError({
        statusCode: 500,
        statusMessage: `Cannot store the key: ${(err as Error)?.message ?? 'encryption failed'}`
      })
    }
  }
  await setSetting(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_API_KEY, stored)
}

export async function hasOrgApiKey(tx: AiDbClient): Promise<boolean> {
  return (await getOrgApiKey(tx)).status === 'ok'
}

// The key generation runs with: the org's own when set, else the host's env
// key. A stored key that no longer decrypts is an error, not a silent fallback
// onto the host's budget.
export async function getEffectiveApiKey(tx: AiDbClient): Promise<string> {
  const org = await getOrgApiKey(tx)
  if (org.status === 'ok') return org.key
  if (org.status === 'undecryptable') {
    throw createError({
      statusCode: 500,
      statusMessage: 'This organization\'s stored AI key can no longer be decrypted. Remove it and enter it again.'
    })
  }
  return getHostApiKey()
}

// The key a call to `provider` runs with. Tinfoil has only the host's key.
export async function getProviderApiKey(tx: AiDbClient, provider: AiProvider): Promise<string> {
  if (provider === 'tinfoil') return getTinfoilConfig().apiKey
  return await getEffectiveApiKey(tx)
}

// --- Model resolution ---

// Placeholder info for an id that is stored but not in the live list.
export function modelInfoOrPlaceholder(id: string): AiProviderModelInfo {
  return getModelInfo(id) ?? {
    id,
    name: id,
    promptPrice: null,
    completionPrice: null,
    contextLength: null,
    supportsTemperature: false,
    supportsCaching: false,
    provider: providerOf(id),
    kind: 'chat',
    supportsImages: false,
    requestPrice: null,
    reasoning: null
  }
}

// Whether `id` can serve `kind`. A model missing from the loaded catalogs has
// no known kind and passes, as isKnownModel passes an id it can't check.
export function modelFitsKind(id: string, kind: AiFeatureKind): boolean {
  const known = getModelInfo(id)?.kind
  return known === undefined || known === kind
}

// The host-enabled set, narrowed to models their provider still lists.
export async function getHostEnabledModelIds(tx: AiDbClient): Promise<string[]> {
  await getAllModels()
  const enabled = await getHostSetting<string[]>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_ENABLED_MODELS)
  return enabled.filter(isKnownModel)
}

// The ids the active org may run: on its own key every OpenRouter model plus
// the host-enabled Tinfoil models; on the host's key the host-enabled set.
export async function getAllowedModelIds(tx: AiDbClient): Promise<string[]> {
  if (await hasOrgApiKey(tx)) {
    const openrouter = (await getAllModels()).filter(m => m.provider === 'openrouter').map(m => m.id)
    const hostTinfoil = (await getHostEnabledModelIds(tx)).filter(id => providerOf(id) === 'tinfoil')
    return [...openrouter, ...hostTinfoil]
  }
  return await getHostEnabledModelIds(tx)
}

export async function getAllowedModels(tx: AiDbClient): Promise<AiProviderModelInfo[]> {
  const ids = await getAllowedModelIds(tx)
  return ids.map(modelInfoOrPlaceholder)
}

// First candidate of `kind` the org may use, in precedence order; '' when none.
function firstAllowed(candidates: (string | undefined)[], allowed: Set<string>, kind: AiFeatureKind): string {
  for (const c of candidates) {
    if (c && allowed.has(c) && modelFitsKind(c, kind)) return c
  }
  return ''
}

// The org's default if allowed, else the host's default if allowed, else ''.
export async function resolveDefaultModel(tx: AiDbClient): Promise<string> {
  const [allowed, orgDefault, hostDefault] = await Promise.all([
    getAllowedModelIds(tx),
    getSetting<string>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_DEFAULT_MODEL),
    getHostSetting<string>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_DEFAULT_MODEL)
  ])
  return firstAllowed([orgDefault, hostDefault], new Set(allowed), 'chat')
}

// The model a feature runs on for the active org: org feature choice → org
// default → host feature choice → host default (chat features), or org feature
// choice → host feature choice (transcription features), first one the org
// may use. '' when nothing resolves; callers must not run model-less.
export async function resolveFeatureModel(tx: AiDbClient, feature: string): Promise<string> {
  const [allowed, orgFeatures, orgDefault, hostFeatures, hostDefault] = await Promise.all([
    getAllowedModelIds(tx),
    getSetting<Record<string, string>>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_FEATURE_MODELS),
    getSetting<string>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_DEFAULT_MODEL),
    getHostSetting<Record<string, string>>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_FEATURE_MODELS),
    getHostSetting<string>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_DEFAULT_MODEL)
  ])
  const kind = getAiFeatureKind(feature)
  const candidates = kind === 'chat'
    ? [orgFeatures[feature], orgDefault, hostFeatures[feature], hostDefault]
    : [orgFeatures[feature], hostFeatures[feature]]
  return firstAllowed(candidates, new Set(allowed), kind)
}

// --- Embedding model resolution ---

// The org's own embedding model if still listed, else the host's, else ''.
// There is no host-enabled set for embeddings: one model per scope is enough,
// and an org on its own key may pick any listed one.
export async function resolveEmbeddingModel(tx: AiDbClient): Promise<string> {
  await getEmbeddingModelList()
  const [orgModel, hostModel] = await Promise.all([
    getSetting<string>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_EMBEDDING_MODEL),
    getHostSetting<string>(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_EMBEDDING_MODEL)
  ])
  for (const id of [orgModel, hostModel]) {
    if (id && isKnownEmbeddingModel(id)) return id
  }
  return ''
}
