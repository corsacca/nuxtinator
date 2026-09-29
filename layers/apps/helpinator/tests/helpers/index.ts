// Helpinator test helpers. Re-exports tenancy + core helpers and adds: an org
// with the helpinator/context/inbox apps enabled, portfolio + section seeding,
// widget seeding, the AI fake, and cleanup.
//
// Everything is tagged `test-helpinator-` (users, org slugs) so cleanup stays
// scoped; helpinator, context and inbox rows cascade off the test orgs.
import type postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  createTestUser,
  getAuthHeaders,
  withOrgHeader,
  type AuthHeaders,
  type TestUser,
  createTestOrg,
  addTestMembership,
  type TestOrg
} from 'layer-tenancy/test-helpers'

export * from 'layer-tenancy/test-helpers'

// An origin allowed on seeded widgets. Not loopback, so origin checks bite.
export const SITE_ORIGIN = 'https://help-site.example'

export async function createHelpinatorUser(sql: ReturnType<typeof postgres>): Promise<TestUser> {
  return createTestUser(sql, { email: `test-helpinator-${randomUUID().slice(0, 8)}@example.com` })
}

export async function createHelpinatorOrgWith(
  sql: ReturnType<typeof postgres>,
  roles: string[] = ['admin']
): Promise<{ org: TestOrg, user: TestUser, auth: AuthHeaders, opts: ReturnType<typeof withOrgHeader> }> {
  const user = await createHelpinatorUser(sql)
  const org = await createTestOrg(sql, { slug: `test-helpinator-${randomUUID().slice(0, 8)}`, name: 'Test Helpinator Org' })
  await addTestMembership(sql, { user_id: user.id, org_id: org.id, roles })
  for (const app of ['helpinator', 'context', 'inbox', 'crm']) {
    await sql`INSERT INTO apps (id, status) VALUES (${app}, 'available') ON CONFLICT (id) DO NOTHING`
    await sql`
      INSERT INTO org_apps (org_id, app_id, enabled, source)
      VALUES (${org.id}, ${app}, true, 'org_admin')
      ON CONFLICT DO NOTHING
    `
  }
  return { org, user, auth: getAuthHeaders(user), opts: withOrgHeader(getAuthHeaders(user), org.slug) }
}

export async function addHelpinatorMember(
  sql: ReturnType<typeof postgres>,
  org: TestOrg,
  roles: string[] = ['member']
): Promise<{ user: TestUser, opts: ReturnType<typeof withOrgHeader> }> {
  const user = await createHelpinatorUser(sql)
  await addTestMembership(sql, { user_id: user.id, org_id: org.id, roles })
  return { user, opts: withOrgHeader(getAuthHeaders(user), org.slug) }
}

// A portfolio with the given sections (key → content). Custom section
// definitions carry their own titles, so no catalog dependency.
export async function seedPortfolio(
  sql: ReturnType<typeof postgres>,
  orgId: string,
  name: string,
  sections: Record<string, string>
): Promise<{ id: string, slug: string }> {
  const id = randomUUID()
  const slug = `test-helpinator-${randomUUID().slice(0, 8)}`
  await sql`INSERT INTO context_portfolios (id, slug, name, org_id) VALUES (${id}, ${slug}, ${name}, ${orgId})`
  for (const [key, content] of Object.entries(sections)) {
    await sql`
      INSERT INTO context_section_definitions (portfolio_id, key, title, description)
      VALUES (${id}, ${key}, ${`Title ${key}`}, '')
    `
    await sql`
      INSERT INTO context_sections (portfolio_id, section_key, content)
      VALUES (${id}, ${key}, ${content})
    `
  }
  return { id, slug }
}

export async function seedWidget(
  sql: ReturnType<typeof postgres>,
  opts: { orgId: string, portfolioId: string, sectionKey: string, origins?: string[], cap?: number, enabled?: boolean }
): Promise<{ id: string }> {
  const id = randomUUID()
  await sql`
    INSERT INTO helpinator_widgets (id, name, portfolio_id, default_section_key, allowed_origins, daily_message_cap, enabled, org_id)
    VALUES (${id}, 'Test widget', ${opts.portfolioId}, ${opts.sectionKey}, ${opts.origins ?? [SITE_ORIGIN]},
            ${opts.cap ?? 500}, ${opts.enabled ?? true}, ${opts.orgId})
  `
  return { id }
}

// --- Public widget calls ----------------------------------------------------

export function widgetHeaders(token?: string | null, origin = SITE_ORIGIN): Record<string, string> {
  return { origin, ...(token ? { authorization: `Bearer ${token}` } : {}) }
}

export interface TurnResult {
  token: string
  conversationId: string
  reset: boolean
  userMessage: { id: string, content: string }
  assistantMessage: { id: string, content: string }
}

export async function sendTurn(widgetId: string, message: string, token?: string | null, origin?: string): Promise<TurnResult> {
  return await $fetch<TurnResult>(`/api/v1/helpinator/widgets/${widgetId}/messages`, {
    method: 'POST',
    headers: widgetHeaders(token, origin),
    body: { message, pageUrl: `${SITE_ORIGIN}/pricing` }
  })
}

// --- The AI fake --------------------------------------------------------------

export interface AiFakeCall {
  kind: 'complete' | 'generate'
  system: unknown
  messages: Array<{ role: string, content: unknown }>
  tools: string[]
  toolResults: Array<{ name: string, input: Record<string, unknown>, result: string }>
}

export async function primeAiFake(script: { text?: string, toolCalls?: Array<{ name: string, input: Record<string, unknown> }> }): Promise<void> {
  await $fetch('/api/_test/ai', { method: 'POST', body: script })
}

export async function getAiFakeLog(): Promise<AiFakeCall[]> {
  return await $fetch<AiFakeCall[]>('/api/_test/ai')
}

export async function resetAiFake(): Promise<void> {
  await $fetch('/api/_test/ai', { method: 'DELETE' })
}

export function systemText(call: { system?: unknown }): string {
  const s = call.system
  if (typeof s === 'string') return s
  return Array.isArray(s) ? s.map(p => String((p as { text?: string }).text ?? '')).join('') : ''
}

export async function cleanupHelpinatorTestData(sql: ReturnType<typeof postgres>): Promise<void> {
  // Every test shares one client IP; reset the widget rate-limit windows.
  await sql`DELETE FROM activity_logs WHERE event_type LIKE 'ratelimit.helpinator%'`
  // Helpinator, context and inbox rows cascade off the org (tenancy retrofits).
  await sql`DELETE FROM orgs WHERE slug LIKE 'test-helpinator-%'`
  await sql`DELETE FROM users WHERE email LIKE 'test-helpinator-%@example.com'`
}
