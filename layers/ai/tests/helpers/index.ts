// AI-layer test helpers. Re-exports tenancy + core helpers and adds an
// operator-admin-in-a-fresh-org bootstrap (the AI admin endpoints gate on
// requireOperatorAdmin; the org gives the caller an ordinary tenant context)
// plus prefix-scoped cleanup.
//
// All seeded data is prefixed `test-ai-` (users, org slugs) so cleanup stays
// scoped. AI config is host-level (`core_host_settings`, namespace `ai`) and
// shared by every test, so cleanup wipes that namespace too.
import type postgres from 'postgres'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  getAuthHeaders,
  withOrgHeader,
  createTestOrg,
  addTestMembership,
  type AuthHeaders,
  type TestUser,
  type TestOrg
} from 'layer-tenancy/test-helpers'

export * from 'layer-tenancy/test-helpers'

// An operator-admin user (users.is_admin) in a fresh org with membership, plus
// X-Active-Org opts so calls look like normal in-org traffic. Pass
// `{ admin: false }` for a non-operator user to assert the 403 gate.
export async function createAiOrg(
  sql: ReturnType<typeof postgres>,
  { admin = true }: { admin?: boolean } = {}
): Promise<{ org: TestOrg, user: TestUser, auth: AuthHeaders, opts: ReturnType<typeof withOrgHeader> }> {
  const user = await createTestUser(sql, {
    email: `test-ai-${randomUUID().slice(0, 8)}@example.com`,
    is_admin: admin
  })
  const org = await createTestOrg(sql, {
    slug: `test-ai-${randomUUID().slice(0, 8)}`,
    name: 'Test AI Org'
  })
  await addTestMembership(sql, { user_id: user.id, org_id: org.id, roles: ['admin'] })

  const auth = getAuthHeaders(user)
  return { org, user, auth, opts: withOrgHeader(auth, org.slug) }
}

export async function cleanupAiTestData(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`DELETE FROM core_host_settings WHERE namespace = 'ai'`
  await sql`DELETE FROM orgs WHERE slug LIKE 'test-ai-%'`
  await sql`DELETE FROM users WHERE email LIKE 'test-ai-%'`
}

// --- The AI fake (VITEST network stand-in) ---
//
// The booted host routes every `complete()` / `generate()` to a primeable fake
// (server/utils/ai-test-fake.ts). These helpers drive it over its control
// endpoint so a consumer-layer suite can script the model's next answer and
// assert what it was asked.

export interface AiFakeScript {
  text?: string
  toolCalls?: Array<{ name: string, input: Record<string, unknown> }>
  generateInput?: Record<string, unknown>
}

export interface AiFakeCall {
  kind: 'complete' | 'generate'
  model: string
  system: unknown
  messages: Array<{ role: string, content: unknown }>
  tools: string[]
  toolResults: Array<{ name: string, input: Record<string, unknown>, result: string }>
}

export async function primeAiFake(script: AiFakeScript): Promise<void> {
  await $fetch('/api/_test/ai', { method: 'POST', body: script })
}

export async function getAiFakeLog(): Promise<AiFakeCall[]> {
  return await $fetch<AiFakeCall[]>('/api/_test/ai')
}

export async function resetAiFake(): Promise<void> {
  await $fetch('/api/_test/ai', { method: 'DELETE' })
}
