import { requireOperatorAdmin } from '#tenant/server'
import { getAvailableLayerUpdates } from '../utils/layer-updates'

// Host admin: which installed layers have newer versions available. Read-only;
// gated by `is_admin`. Pass ?refresh=1 to bypass the cache and re-check now.
export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)
  const force = getQuery(event).refresh === '1'
  return { updates: await getAvailableLayerUpdates({ force }) }
})
