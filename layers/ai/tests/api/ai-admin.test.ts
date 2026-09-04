// AI admin config endpoints: operator-admin gating, the catalog + enabled-set
// read, and enable / custom-model / feature-model write round-trips (including
// the sanitize-on-write behaviour). Runs against the booted host with the VITEST
// stub, so no API key is needed.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { getHostAdminDb, createAiOrg, cleanupAiTestData } from '../helpers'

interface AiModel {
  id: string
  label: string
  supportsTemperature: boolean
  supportsCaching: boolean
  custom: boolean
  enabled: boolean
}
interface AiConfig {
  configured: boolean
  models: AiModel[]
  features: { key: string, label: string, model: string }[]
}

const sql = getHostAdminDb()

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
    expect(config.configured).toBe(true)
    expect(config.models.length).toBeGreaterThan(0)
  })

  it('reports configured (VITEST) and the default-enabled catalog', async () => {
    const { opts } = await createAiOrg(sql)
    const config = await getConfig(opts)
    expect(config.configured).toBe(true)
    const sonnet = config.models.find(m => m.id === 'anthropic/claude-sonnet-4.5')
    expect(sonnet).toBeDefined()
    expect(sonnet!.enabled).toBe(true)
    // A default-disabled catalog model is present but off.
    const gpt = config.models.find(m => m.id === 'openai/gpt-4.1')
    expect(gpt).toBeDefined()
    expect(gpt!.enabled).toBe(false)
  })

  it('enables a model and reflects it on read', async () => {
    const { opts } = await createAiOrg(sql)
    await putConfig(opts, { enabled_models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-4.1'] })
    const config = await getConfig(opts)
    expect(config.models.find(m => m.id === 'openai/gpt-4.1')!.enabled).toBe(true)
    // The Haiku default is no longer in the enabled set (whole-set replace).
    expect(config.models.find(m => m.id === 'anthropic/claude-3.5-haiku')!.enabled).toBe(false)
  })

  it('sanitizes the enabled set on write (dedupes, drops non-strings and unknown ids)', async () => {
    const { opts } = await createAiOrg(sql)
    await putConfig(opts, {
      enabled_models: ['anthropic/claude-sonnet-4.5', 'anthropic/claude-sonnet-4.5', 42, 'not/a-real-model']
    })
    const config = await getConfig(opts)
    const enabled = config.models.filter(m => m.enabled).map(m => m.id)
    // The dup collapses, the number is dropped, and the unknown id is narrowed
    // out (not in catalog, not a registered custom id).
    expect(enabled).toEqual(['anthropic/claude-sonnet-4.5'])
  })

  it('adds a custom model id and enables it', async () => {
    const { opts } = await createAiOrg(sql)
    await putConfig(opts, {
      custom_models: ['anthropic/claude-opus-4.1'],
      enabled_models: ['anthropic/claude-sonnet-4.5', 'anthropic/claude-opus-4.1']
    })
    const config = await getConfig(opts)
    const custom = config.models.find(m => m.id === 'anthropic/claude-opus-4.1')
    expect(custom).toBeDefined()
    expect(custom!.custom).toBe(true)
    expect(custom!.enabled).toBe(true)
  })

  it('shares one config across orgs (host-level)', async () => {
    const a = await createAiOrg(sql)
    const b = await createAiOrg(sql)
    await putConfig(a.opts, { enabled_models: ['openai/gpt-4.1'] })
    const configB = await getConfig(b.opts)
    // B sees A's override: the enabled set is deployment-wide.
    expect(configB.models.find(m => m.id === 'openai/gpt-4.1')!.enabled).toBe(true)
    expect(configB.models.find(m => m.id === 'anthropic/claude-sonnet-4.5')!.enabled).toBe(false)
  })
})

describe('ai status', () => {
  it('reports configured + enabled model availability', async () => {
    const { opts } = await createAiOrg(sql)
    const status = await $fetch<{ configured: boolean, hasEnabledModel: boolean, featureAvailable: boolean }>(
      '/api/ai/status',
      { ...opts }
    )
    expect(status.configured).toBe(true)
    expect(status.hasEnabledModel).toBe(true)
    expect(status.featureAvailable).toBe(true)
  })
})
