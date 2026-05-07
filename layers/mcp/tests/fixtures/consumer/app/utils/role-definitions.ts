import type { Permission } from './permissions'

// Static role catalog. The harness's createTestUser() picks 'admin' (full
// permission set) when the test asks for everything; tests that need a
// specific permission subset assign permissions directly via users.roles.
export interface RoleDefinition {
  name: string
  permissions: Permission[]
}

export const ROLES: Record<string, RoleDefinition> = {
  admin: {
    name: 'admin',
    permissions: [
      'admin.access',
      'pages.view',
      'pages.write',
      'pages.publish',
      'users.view',
      'users.manage'
    ]
  },
  reader: {
    name: 'reader',
    permissions: ['pages.view']
  },
  writer: {
    name: 'writer',
    permissions: ['pages.view', 'pages.write']
  },
  publisher: {
    name: 'publisher',
    permissions: ['pages.view', 'pages.write', 'pages.publish']
  }
}

export const STATIC_ROLE_NAMES: readonly string[] = Object.keys(ROLES)
export type StaticRoleName = keyof typeof ROLES

export function getStaticRole(name: string): RoleDefinition | null {
  return ROLES[name] ?? null
}

export function isStaticRole(name: string): name is StaticRoleName {
  return name in ROLES
}
