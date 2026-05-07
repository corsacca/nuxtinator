// In-app navigation registry. App layers register sidebar / top-nav items
// per app via `registerNavItem({ appId, title, path, ... })`. The host
// renders these via `useAppNav(appId)` → `/api/_nav?app=<id>`, filtered by
// the current user's permissions.

export interface NavItem {
  appId: string
  title: string
  path: string
  icon?: string
  requiredPermission?: string
  order?: number
}

const _items: NavItem[] = []

export function registerNavItem(item: NavItem): void {
  if (!item || typeof item.appId !== 'string' || item.appId.length === 0) return
  if (typeof item.path !== 'string' || item.path.length === 0) return
  _items.push(item)
}

export function getNavItems(appId: string): NavItem[] {
  return _items
    .filter(i => i.appId === appId)
    .sort((a, b) => {
      const ao = a.order ?? 100
      const bo = b.order ?? 100
      if (ao !== bo) return ao - bo
      return a.title.localeCompare(b.title)
    })
}

export function getAllNavItems(): NavItem[] {
  return [..._items]
}

export function __resetNavRegistryForTests(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetNavRegistryForTests is not callable in production')
  }
  _items.length = 0
}
