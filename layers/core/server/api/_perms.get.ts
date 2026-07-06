import { withOrgContext } from '#tenant/server'

// Host-level effective-permissions feed for single-tenant deploys.
// (Multi-tenant mode uses the org-scoped `/api/o/:slug/_perms` from the
// tenancy layer; this endpoint is the no-org analog `usePermissions` calls
// when tenancy isn't loaded.) Returns the caller's effective permission list
// — union(role perms) ∪ direct grants, as computed by the kernel — plus the
// role list, for the client permission store.
export default defineEventHandler(async (event) => {
  return await withOrgContext(event, async (_tx, ctx) => {
    return {
      perms: [...ctx.perms].sort(),
      roles: ctx.roles
    }
  })
})
