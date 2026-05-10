import { requireOperatorAdmin } from '#tenant/server'
import { getAllStaticRoles } from '#core/server/utils/roles-registry'

// Lightweight host-admin lookup of every static role registered in this
// process — host-static (`role-definitions.ts`) + app-static
// (`registerStaticRole(...)`) including the special `admin` role. Used by
// admin UIs that need to populate role pickers without per-org context
// (e.g. /admin/users → "Add to org" multi-select). Custom roles are
// per-org and live behind the org-scoped endpoints.
export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)

  return {
    roles: getAllStaticRoles().map(r => ({
      key: r.key,
      name: r.name,
      description: r.description,
      source: r.source
    }))
  }
})
