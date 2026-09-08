// Org AI settings endpoints: org.settings.write gating, the key lifecycle
// (verify-on-save, masked read, remove), how the org's allowed set widens on
// its own key and narrows back on the host's, the org → host resolution chain,
// and per-org isolation. Runs against the booted host with the VITEST stub: the
// model list is fixed and any key other than the literal 'invalid' verifies.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  createAiOrg,
  createAiOrgMember,
  cleanupAiTestData,
  clearAiHostConfig,
  AI_TEST_MODEL_IDS
} from '../helpers'

interface OrgConfig {
  key: { status: 'none' | 'ok' | 'undecryptable', last4: string }
  hostKeyConfigured: boolean
  usingOwnKey: boolean
  modelListAvailable: boolean
  allowedModels: { id: string, name: string }[]
  defaultModel: string
  effectiveDefaultModel: string
  features: { key: string, model: string, effectiveModel: string }[]
}
interface Status {
  configured: boolean
  hasEnabledModel: boolean
  featureAvailable: boolean
}

const sql = getHostAdminDb()
const [ALPHA, BETA, GAMMA] = AI_TEST_MODEL_IDS

async function getOrgConfig(opts: object): Promise<OrgConfig> {
  return $fetch<OrgConfig>('/api/ai/org/config', { ...opts })
}
async function putOrgConfig(opts: object, body: Record<string, unknown>): Promise<unknown> {
  return $fetch('/api/ai/org/config', { method: 'PUT', body, ...opts })
}
async function putKey(opts: object, key: string): Promise<{ ok: boolean, last4: string }> {
  return $fetch('/api/ai/org/key', { method: 'PUT', body: { key }, ...opts })
}
async function deleteKey(opts: object): Promise<unknown> {
  return $fetch('/api/ai/org/key', { method: 'DELETE', ...opts })
}
async function hostConfig(opts: object, body: Record<string, unknown>): Promise<unknown> {
  return $fetch('/api/ai/admin/config', { method: 'PUT', body, ...opts })
}
async function status(opts: object, feature?: string): Promise<Status> {
  const url: string = feature ? `/api/ai/status?feature=${encodeURIComponent(feature)}` : '/api/ai/status'
  return $fetch<Status>(url, { ...opts })
}

describe('ai org config', () => {
  beforeAll(async () => {
    await cleanupAiTestData(sql)
  })
  beforeEach(async () => {
    await clearAiHostConfig(sql)
  })
  afterAll(async () => {
    await cleanupAiTestData(sql)
  })

  it('rejects a member without org.settings.write', async () => {
    const { org } = await createAiOrg(sql)
    const member = await createAiOrgMember(sql, org)
    await expect(getOrgConfig(member.opts)).rejects.toMatchObject({ statusCode: 403 })
    await expect(putKey(member.opts, 'sk-or-member')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects a missing org context', async () => {
    const { auth } = await createAiOrg(sql)
    await expect(getOrgConfig(auth)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('starts on the host key with the host-enabled set as the allowed models', async () => {
    const { opts } = await createAiOrg(sql)
    await hostConfig(opts, { enabled_models: [ALPHA], default_model: ALPHA })
    const config = await getOrgConfig(opts)
    expect(config.key.status).toBe('none')
    expect(config.usingOwnKey).toBe(false)
    expect(config.allowedModels.map(m => m.id)).toEqual([ALPHA])
    expect(config.defaultModel).toBe('')
    expect(config.effectiveDefaultModel).toBe(ALPHA)
  })

  it('refuses a model outside the allowed set', async () => {
    const { opts } = await createAiOrg(sql)
    await hostConfig(opts, { enabled_models: [ALPHA], default_model: ALPHA })
    await expect(putOrgConfig(opts, { default_model: BETA })).rejects.toMatchObject({ statusCode: 400 })
    await expect(putOrgConfig(opts, { feature_models: { 'some.feature': GAMMA } })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a key OpenRouter refuses and stores nothing', async () => {
    const { opts } = await createAiOrg(sql)
    await expect(putKey(opts, 'invalid')).rejects.toMatchObject({ statusCode: 400 })
    await expect(putKey(opts, '')).rejects.toMatchObject({ statusCode: 400 })
    expect((await getOrgConfig(opts)).key.status).toBe('none')
  })

  it('stores a verified key encrypted, reports only the last four, and widens the allowed set', async () => {
    const { org, opts } = await createAiOrg(sql)
    await hostConfig(opts, { enabled_models: [ALPHA], default_model: ALPHA })

    const res = await putKey(opts, 'sk-or-test-abcd1234')
    expect(res.last4).toBe('1234')

    const config = await getOrgConfig(opts)
    expect(config.key).toEqual({ status: 'ok', last4: '1234' })
    expect(config.usingOwnKey).toBe(true)
    expect(config.allowedModels.map(m => m.id).sort()).toEqual([...AI_TEST_MODEL_IDS].sort())
    expect(JSON.stringify(config)).not.toContain('sk-or-test')

    // At rest: a ciphertext, not the key.
    const [row] = await sql<{ value: string }[]>`
      SELECT value FROM core_settings WHERE org_id = ${org.id} AND namespace = 'ai' AND key = 'api_key'
    `
    expect(row!.value).toBeTruthy()
    expect(row!.value).not.toContain('sk-or-test')
  })

  it('lets an org on its own key pick any listed model, and falls back when the key is removed', async () => {
    const { opts } = await createAiOrg(sql)
    await hostConfig(opts, { enabled_models: [ALPHA], default_model: ALPHA })
    await putKey(opts, 'sk-or-test-own')

    await putOrgConfig(opts, { default_model: GAMMA })
    let config = await getOrgConfig(opts)
    expect(config.defaultModel).toBe(GAMMA)
    expect(config.effectiveDefaultModel).toBe(GAMMA)
    expect((await status(opts)).featureAvailable).toBe(true)

    await deleteKey(opts)
    config = await getOrgConfig(opts)
    expect(config.key.status).toBe('none')
    // The stored choice survives but no longer applies; the host default wins.
    expect(config.defaultModel).toBe(GAMMA)
    expect(config.effectiveDefaultModel).toBe(ALPHA)
    expect(config.allowedModels.map(m => m.id)).toEqual([ALPHA])
  })

  it('resolves a feature org choice → org default → host choice → host default', async () => {
    const { opts } = await createAiOrg(sql)
    const feature = 'test.feature'
    await hostConfig(opts, { enabled_models: [ALPHA, BETA], default_model: ALPHA })

    // Host default only.
    expect((await status(opts, feature)).featureAvailable).toBe(true)
    let config = await getOrgConfig(opts)
    expect(config.effectiveDefaultModel).toBe(ALPHA)

    // Host feature choice beats host default.
    await hostConfig(opts, { feature_models: { [feature]: BETA } })
    // Org default beats the host feature choice.
    await putOrgConfig(opts, { default_model: BETA })
    config = await getOrgConfig(opts)
    expect(config.effectiveDefaultModel).toBe(BETA)

    // Org feature choice beats everything.
    await putOrgConfig(opts, { feature_models: { [feature]: ALPHA } })
    await putOrgConfig(opts, { default_model: BETA })
    // The feature isn't registered by a layer, so read it back through the
    // stored map rather than the features list.
    const [row] = await sql<{ value: Record<string, string> }[]>`
      SELECT value FROM core_settings WHERE namespace = 'ai' AND key = 'feature_models'
      ORDER BY updated_at DESC LIMIT 1
    `
    expect(row!.value[feature]).toBe(ALPHA)
  })

  it('keeps each org\'s key and choices to itself', async () => {
    const a = await createAiOrg(sql)
    const b = await createAiOrg(sql)
    await hostConfig(a.opts, { enabled_models: [ALPHA], default_model: ALPHA })
    await putKey(a.opts, 'sk-or-test-org-a')
    await putOrgConfig(a.opts, { default_model: GAMMA })

    const configB = await getOrgConfig(b.opts)
    expect(configB.key.status).toBe('none')
    expect(configB.usingOwnKey).toBe(false)
    expect(configB.defaultModel).toBe('')
    expect(configB.allowedModels.map(m => m.id)).toEqual([ALPHA])
  })

  it('writes key and model changes to the org activity log without the key', async () => {
    const { org, opts } = await createAiOrg(sql)
    await hostConfig(opts, { enabled_models: [ALPHA], default_model: ALPHA })
    await putKey(opts, 'sk-or-test-audit-zz99')
    await putOrgConfig(opts, { default_model: ALPHA })
    await deleteKey(opts)

    const rows = await sql<{ event_type: string, metadata: Record<string, unknown> | null }[]>`
      SELECT event_type, metadata FROM activity_logs WHERE org_id = ${org.id} AND event_type LIKE 'ai_org_%' ORDER BY timestamp
    `
    expect(rows.map(r => r.event_type)).toEqual(['ai_org_key_set', 'ai_org_models_updated', 'ai_org_key_removed'])
    expect(JSON.stringify(rows)).not.toContain('sk-or-test')
    expect(rows[0]!.metadata?.last4).toBe('zz99')
  })
})
