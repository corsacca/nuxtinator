// GET /api/ai/models
// The live, tool-capable OpenRouter model list for the pickers (host admin and
// org settings pages). Auth-gated only: the list is public data, and which
// models a caller may actually select is enforced by the config endpoints.
import { requireAuth } from '#core/server/utils/auth'
import { getModelList } from '#ai/server'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  return { models: await getModelList() }
})
