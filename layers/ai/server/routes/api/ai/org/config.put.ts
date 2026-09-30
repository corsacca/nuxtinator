// PUT /api/ai/org/config
// Update the active org's default model, per-feature choices and embedding
// model. Partial: each of default_model / feature_models / embedding_model is
// written only when present. A new embedding model is probed with the org's
// effective key first (see admin/config.put.ts). Every
// chosen id must be '' (unset, fall back to the host) or one the org may use
// right now — the host-enabled set on the host's key, any listed model on its
// own. Gated by org.settings.write.
import { readBody } from 'h3'
import { withOrgPermission } from '#tenant/server'
import { setSetting } from '#core/server/utils/settings-store'
import { logEvent } from '#core/server/utils/activity-logger'
import type { Permission } from '#core/app/utils/permissions'
import {
  AI_SETTINGS_NAMESPACE,
  AI_SETTING_DEFAULT_MODEL,
  AI_SETTING_FEATURE_MODELS,
  AI_SETTING_EMBEDDING_MODEL,
  getAllowedModelIds,
  sanitizeModelId,
  sanitizeFeatureModels,
  getEmbeddingModelList,
  isKnownEmbeddingModel,
  getEffectiveApiKey,
  probeEmbeddingModel
} from '#ai/server'

const ORG_SETTINGS_WRITE = 'org.settings.write' as Permission

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) ?? {}

  return await withOrgPermission(event, ORG_SETTINGS_WRITE, async (tx, ctx) => {
    const allowed = new Set(await getAllowedModelIds(tx))
    const changed: Record<string, unknown> = {}

    if (body.default_model !== undefined) {
      const id = sanitizeModelId(body.default_model)
      if (id && !allowed.has(id)) {
        throw createError({ statusCode: 400, statusMessage: 'That model is not available to this organization.' })
      }
      await setSetting(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_DEFAULT_MODEL, id)
      changed.default_model = id
    }

    if (body.embedding_model !== undefined) {
      await getEmbeddingModelList()
      const id = sanitizeModelId(body.embedding_model)
      if (id && !isKnownEmbeddingModel(id)) {
        throw createError({ statusCode: 400, statusMessage: 'That embedding model is not available on OpenRouter.' })
      }
      if (id) {
        const apiKey = await getEffectiveApiKey(tx)
        if (apiKey) await probeEmbeddingModel(apiKey, id)
      }
      await setSetting(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_EMBEDDING_MODEL, id)
      changed.embedding_model = id
    }

    if (body.feature_models !== undefined) {
      const map = sanitizeFeatureModels(body.feature_models)
      for (const [feature, id] of Object.entries(map)) {
        if (!allowed.has(id)) {
          throw createError({ statusCode: 400, statusMessage: `The model for "${feature}" is not available to this organization.` })
        }
      }
      await setSetting(tx, AI_SETTINGS_NAMESPACE, AI_SETTING_FEATURE_MODELS, map)
      changed.feature_models = map
    }

    await logEvent({
      eventType: 'ai_org_models_updated',
      tableName: 'core_settings',
      recordId: `${AI_SETTINGS_NAMESPACE}:models`,
      userId: ctx.userId,
      metadata: changed
    }, tx)

    return { ok: true }
  })
})
