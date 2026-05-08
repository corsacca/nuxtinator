// Add the OAuth admin dashboard (`/admin/oauth`) to the host's admin shell.
// Same registry pattern that core/tenancy use.
//
// Operator-admin gating happens server-side via `requireOperatorAdmin` on
// the `/api/admin/oauth/*` endpoints and via the `admin` middleware on the
// page itself. We don't set `requiredPermission` because operator-admin is
// a single bit (`users.is_admin`), not a permission slug — and the
// host-admin shell endpoint filters out sections that declare one.

import { registerAdminSection } from '#core/server/utils/admin-section-registry'

export default defineNitroPlugin(() => {
  registerAdminSection({
    appId: 'oauth',
    title: 'OAuth',
    path: '/admin/oauth',
    icon: 'i-lucide-key-round',
    parent: '/admin/users',
    order: 10
  })
})
