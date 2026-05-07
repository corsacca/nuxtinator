import { requireOperatorAdmin } from '#tenant/server'
import { getAdminSections } from '../utils/admin-section-registry'

// Host-admin shell sections. Gated by `is_admin` (single bit). Sections
// can still declare a `requiredPermission`, but for host-admin context we
// don't have an org's perm set to check against — so sections that DO declare
// a `requiredPermission` are silently filtered out for host admin until that
// section explicitly opts in to a host-admin model. (None do today.)
//
// Rendering host-admin sections via per-org perms was a single-tenancy
// holdover; the only reasonable scoping for `/admin/...` is "are you a host
// admin?".
export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)
  const sections = getAdminSections().filter(s => !s.requiredPermission)
  return { sections }
})
