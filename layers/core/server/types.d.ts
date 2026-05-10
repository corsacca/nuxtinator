// Host-emitted Nitro hooks layers can subscribe to.
//
// Layer authors register handlers in their own Nitro plugin via:
//
//   const nitro = useNitroApp()
//   nitro.hooks.hook('membership.created', async (p) => { ... })
//
// Hook handlers MUST be best-effort — a thrown handler does NOT roll back the
// triggering DB write. The host wraps each handler in try/catch and logs the
// error. See [documentation/layers.md](../documentation/layers.md) for the
// full reference.

interface CoreHookMap {
  'org.created': (p: {
    orgId: string
    slug: string
    createdByUserId: string | null
  }) => void | Promise<void>
  'org.deleted': (p: {
    orgId: string
    slug: string
  }) => void | Promise<void>
  'user.created': (p: {
    userId: string
    email: string
    viaInvite: boolean
  }) => void | Promise<void>
  'user.verified': (p: {
    userId: string
    email: string
  }) => void | Promise<void>
  'membership.created': (p: {
    membershipId: string
    userId: string
    orgId: string
    roles: string[]
    createdByUserId: string | null
  }) => void | Promise<void>
  'membership.updated': (p: {
    membershipId: string
    userId: string
    orgId: string
    oldRoles: string[]
    newRoles: string[]
  }) => void | Promise<void>
  'membership.deleted': (p: {
    membershipId: string
    userId: string
    orgId: string
  }) => void | Promise<void>
  'app.enabled': (p: {
    orgId: string
    appId: string
  }) => void | Promise<void>
  'app.disabled': (p: {
    orgId: string
    appId: string
  }) => void | Promise<void>
}

declare module 'nitropack/types' {
  interface NitroRuntimeHooks extends CoreHookMap {}
}

declare module 'nitropack' {
  interface NitroRuntimeHooks extends CoreHookMap {}
}

export {}
