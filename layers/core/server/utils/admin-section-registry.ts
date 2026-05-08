// Admin shell navigation registry. The admin sidebar's links — including
// the host's own (Users, Roles, Activity log, etc.) — flow through this
// single registry. A host-side Nitro plugin (`server/plugins/register-host-admin.ts`)
// registers the built-in entries with `appId: 'host'`. App layers register
// their own admin-area entries the same way.
//
// One nav source, one renderer: `/api/_admin-sections` → `useAdminSections()`.

export interface AdminSection {
  appId: string // 'host' for host-built-ins, app id otherwise
  title: string
  path: string
  icon?: string
  requiredPermission?: string
  order?: number
  // When set, render this section nested under the section with this
  // `path` as its parent. The admin layout indents children under their
  // parent in the sidebar.
  parent?: string
}

const _sections: AdminSection[] = []

export function registerAdminSection(section: AdminSection): void {
  if (!section || typeof section.path !== 'string' || section.path.length === 0) return
  if (typeof section.appId !== 'string' || section.appId.length === 0) return
  _sections.push(section)
}

export function getAdminSections(): AdminSection[] {
  return [..._sections].sort((a, b) => {
    const ao = a.order ?? 100
    const bo = b.order ?? 100
    if (ao !== bo) return ao - bo
    return a.title.localeCompare(b.title)
  })
}

export function __resetAdminSectionRegistryForTests(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetAdminSectionRegistryForTests is not callable in production')
  }
  _sections.length = 0
}
