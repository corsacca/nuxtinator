// Tenancy layer's host-admin section: "Organizations" at /admin/orgs.
// Registered only when this layer is loaded; single-tenant deployments don't
// see this entry.
import { registerAdminSection } from '#core/server/utils/admin-section-registry'

export default defineNitroPlugin(() => {
  registerAdminSection({
    appId: 'tenancy',
    title: 'Organizations',
    path: '/admin/orgs',
    icon: 'i-lucide-building-2',
    order: 5
  })
})
