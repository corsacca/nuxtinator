import { withOrgContext } from '#tenant/server'

// Per-org effective-permissions feed for the client permission store
// (`usePermissions`). Returns the caller's effective permission list in this
// org — union(membership role perms) ∪ direct grants, as computed by the
// kernel — plus their membership role list. Single-tenant deploys use the
// host-level `/api/_perms` from core instead.
export default defineEventHandler(async (event) => {
  return await withOrgContext(event, async (_tx, ctx) => {
    return {
      perms: [...ctx.perms].sort(),
      roles: ctx.roles
    }
  })
})
