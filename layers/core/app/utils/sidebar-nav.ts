export interface SidebarNavItem {
  to: string
  label: string
  icon: string
  exact?: boolean
  // Arbitrary per-item data exposed to the `trailing` slot (e.g. unread
  // counts, status icons). SidebarNav itself doesn't read this.
  meta?: unknown
  children?: SidebarNavItem[]
}
