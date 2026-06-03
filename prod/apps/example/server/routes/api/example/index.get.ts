// GET /api/example — stub endpoint.
//
// `defineTenantHandler` is the canonical wrapper for layer routes: it runs
// `requireAuth`, opens a Kysely transaction (`tx`), and in multi-tenant mode
// sets `app.current_org` inside it and enforces that this `appId` is enabled
// for the active org. Single-tenant mode is just `requireAuth` + transaction.
//
// Because it's auth-gated, calling this unauthenticated returns 401, not
// `true`. For a public, no-auth endpoint use `defineEventHandler(() => true)`.
import { defineTenantHandler } from '#tenant/server'

export default defineTenantHandler({ appId: 'example' }, async (_tx, _ctx) => {
  return true
})
