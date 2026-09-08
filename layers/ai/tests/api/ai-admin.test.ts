// Host AI config endpoints: operator-admin gating, the enabled-set / default /
// per-feature read, write validation against the enabled set, and the
// host-level sharing across orgs. Runs against the booted host with the VITEST
// stub (fixed model list, no key needed).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { getHostAdminDb, createAiOrg, cleanupAiTestData, clearAiHostConfig, AI_TEST_MODEL_IDS } from '../helpers'

interface AiEnabled {
  id: string
  name: string
  available: boolean
  supportsCaching: boolean
}
interface AiConfig {
  hostKeyConfigured: boolean
  modelListAvailable: boolean
  enabled: AiEnabled[]
  defaultModel: string
  features: { key: string, label: string, model: string, effectiveModel: string }[]
}

const sql = getHostAdminDb()
const [ALPHA, BETA, GAMMA] = AI_TEST_MODEL_IDS

async function getConfig(opts: object): Promise<AiConfig> {
  return $fetch<AiConfig>('/api/ai/admin/config', { ...opts })
}
async function putConfig(opts: object, body: Record<string, unknown>): Promise<unknown> {
  return $fetch('/api/ai/admin/config', { method: 'PUT', body, ...opts })
}

describe('ai admin config', () => {
  beforeAll(async () => {
    await cleanupAiTestData(sql)
  })
  beforeEach(async () => {
    await clearAiHostConfig(sql)
  })
  afterAll(async () => {
    await cleanupAiTestData(sql)
  })

  it('rejects a non-operator-admin', async () => {
    const { opts } = await createAiOrg(sql, { admin: false })
    await expect(getConfig(opts)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('answers without an active org (the /admin/ai page sends none)', async () => {
    const { auth } = await createAiOrg(sql)
    const config = await getConfig(auth)
    expect(config.modelListAvailable).toBe(true)
  })

  it('starts with nothing enabled and no default', async () => {
    const { opts } = await createAiOrg(sql)
    const config = await getConfig(opts)
    expect(config.enabled).toEqual([])
    expect(config.defaultModel).toBe('')
    for (const f of config.features) expect(f.effectiveModel).toBe('')
  })

  it('serves the live model list to any authenticated user', async () => {
    const { opts } = await createAiOrg(sql, { admin: false })
    const { models } = await $fetch<{ models: { id: string, name: string }[] }>('/api/ai/models', { ...opts })
    expect(models.map(m => m.id)).toEqual(expect.arrayContaining(AI_TEST_MODEL_IDS))
  })

  it('enables models and reflects them with live info', async () => {
    const { opts } = await createAiOrg(sql)
    await putConfig(opts, { enabled_models: [ALPHA, BETA] })
    const config = await getConfig(opts)
    expect(config.enabled.map(m => m.id)).toEqual([ALPHA, BETA])
    const alpha = config.enabled.find(m => m.id === ALPHA)!
    expect(alpha.name).toBe('Test Alpha')
    expect(alpha.available).toBe(true)
    expect(alpha.supportsCaching).toBe(true)
  })

  it('sanitizes the enabled set on write (dedupes, drops non-strings and unlisted ids)', async () => {
    const { opts } = await createAiOrg(sql)
    await putConfig(opts, { enabled_models: [ALPHA, ALPHA, 42, 'not/a-real-model'] })
    const config = await getConfig(opts)
    expect(config.enabled.map(m => m.id)).toEqual([ALPHA])
  })

  it('requires the default model to be enabled', async () => {
    const { opts } = await createAiOrg(sql)
    await putConfig(opts, { enabled_models: [ALPHA] })
    await expect(putConfig(opts, { default_model: BETA })).rejects.toMatchObject({ statusCode: 400 })
    await putConfig(opts, { default_model: ALPHA })
    expect((await getConfig(opts)).defaultModel).toBe(ALPHA)
    // '' clears it.
    await putConfig(opts, { default_model: '' })
    expect((await getConfig(opts)).defaultModel).toBe('')
  })

  it('requires feature models to be enabled and resolves features through the default', async () => {
    const { opts } = await createAiOrg(sql)
    await putConfig(opts, { enabled_models: [ALPHA, BETA], default_model: ALPHA })
    const before = await getConfig(opts)
    // Every registered feature falls back to the host default.
    for (const f of before.features) {
      expect(f.model).toBe('')
      expect(f.effectiveModel).toBe(ALPHA)
    }
    if (before.features.length === 0) return

    const feature = before.features[0]!.key
    await expect(putConfig(opts, { feature_models: { [feature]: GAMMA } })).rejects.toMatchObject({ statusCode: 400 })
    await putConfig(opts, { feature_models: { [feature]: BETA } })
    const after = await getConfig(opts)
    const chosen = after.features.find(f => f.key === feature)!
    expect(chosen.model).toBe(BETA)
    expect(chosen.effectiveModel).toBe(BETA)
  })

  it('shares one config across orgs (host-level)', async () => {
    const a = await createAiOrg(sql)
    const b = await createAiOrg(sql)
    await putConfig(a.opts, { enabled_models: [BETA], default_model: BETA })
    const configB = await getConfig(b.opts)
    expect(configB.enabled.map(m => m.id)).toEqual([BETA])
    expect(configB.defaultModel).toBe(BETA)
  })
})

describe('ai status', () => {
  beforeEach(async () => {
    await clearAiHostConfig(sql)
  })

  it('reports no usable model until the host enables one and picks a default', async () => {
    const { opts } = await createAiOrg(sql)
    const before = await $fetch<{ configured: boolean, hasEnabledModel: boolean, featureAvailable: boolean }>(
      '/api/ai/status',
      { ...opts }
    )
    expect(before.configured).toBe(true)
    expect(before.hasEnabledModel).toBe(false)
    expect(before.featureAvailable).toBe(false)

    await putConfig(opts, { enabled_models: [ALPHA], default_model: ALPHA })
    const after = await $fetch<{ configured: boolean, hasEnabledModel: boolean, featureAvailable: boolean }>(
      '/api/ai/status',
      { ...opts }
    )
    expect(after.hasEnabledModel).toBe(true)
    expect(after.featureAvailable).toBe(true)
  })
})
