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

declare module 'nitropack/types' {
  interface NitroRuntimeHooks {
    'org.created': (p: {
      orgId: string
      slug: string
      createdByUserId: string | null
    }) => unknown | Promise<unknown>
    'org.deleted': (p: {
      orgId: string
      slug: string
    }) => unknown | Promise<unknown>
    'user.created': (p: {
      userId: string
      email: string
      viaInvite: boolean
    }) => unknown | Promise<unknown>
    'user.verified': (p: {
      userId: string
      email: string
    }) => unknown | Promise<unknown>
    'membership.created': (p: {
      membershipId: string
      userId: string
      orgId: string
      roles: string[]
      createdByUserId: string | null
    }) => unknown | Promise<unknown>
    'membership.updated': (p: {
      membershipId: string
      userId: string
      orgId: string
      oldRoles: string[]
      newRoles: string[]
    }) => unknown | Promise<unknown>
    'membership.deleted': (p: {
      membershipId: string
      userId: string
      orgId: string
    }) => unknown | Promise<unknown>
    'app.enabled': (p: {
      orgId: string
      appId: string
    }) => unknown | Promise<unknown>
    'app.disabled': (p: {
      orgId: string
      appId: string
    }) => unknown | Promise<unknown>
  }
}

export {}
