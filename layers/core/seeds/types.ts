import type { Kysely } from 'kysely'

// Bag passed to every layer seed by the runner. Layers can add their own
// keys via module augmentation if they need to publish IDs to seeds that
// run after them (e.g. tenancy publishes `seedOrgId`).
export interface SeedContext {
  // BYPASSRLS Kysely client (host_admin role). Seeds run with this so RLS
  // policies don't block writes to org-scoped tables. Untyped on purpose —
  // each layer's seed casts to its own narrowed Database shape.
  db: Kysely<any>
  // True when the tenancy layer's tables exist (orgs, memberships, org_apps).
  // Detected via information_schema before any seed runs.
  tenancyEnabled: boolean
  // Demo users created by the core seed. The first entry is the operator
  // admin (is_admin=true). Subsequent layer seeds add these users to orgs,
  // channels, etc.
  users: Array<{ id: string, email: string, displayName: string, isAdmin: boolean }>
  // Demo org id, set by the tenancy seed. Null in single-tenant deploys.
  // App-layer seeds use this to scope their demo data via SET LOCAL.
  orgId: string | null
  // Demo org slug. Null in single-tenant deploys.
  orgSlug: string | null
  log: (...parts: unknown[]) => void
}
