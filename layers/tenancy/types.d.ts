/// <reference path="./server/database/schema.d.ts" />

// Page-meta flag honored by the tenancy route guard
// (app/middleware/tenant-route-guard.global.ts): a page that sets
// `definePageMeta({ tenantExempt: true })` is left at its naive path instead of
// being rewritten to `/@<org-slug>/...` or bounced to /orgs. Lets a layer
// exempt its own public route (e.g. a widget sign-in bridge) without editing
// the guard's central prefix list.
declare module '#app' {
  interface PageMeta {
    tenantExempt?: boolean
  }
}

declare module 'vue-router' {
  interface RouteMeta {
    tenantExempt?: boolean
  }
}

export {}
