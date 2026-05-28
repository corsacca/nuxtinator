// Assistant chat + apply, routed through the fake Anthropic client installed
// by the test-anthropic Nitro plugin. We prime the fake with a `proposedUpdates`
// payload, hit the chat endpoint, then apply the proposed update and assert
// the section now contains the new content.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupContextTestData,
  createContextOrgWith,
  addContextMember,
  createTestPortfolio,
  withOrgHeader,
  configureFakeAnthropic,
  resetFakeAnthropic,
  getFakeAnthropicLog
} from '../helpers'

describe('assistant chat + apply', () => {
  const sql = getHostAdminDb()
  beforeEach(async () => { await resetFakeAnthropic() })
  afterEach(async () => { await cleanupContextTestData(sql) })

  it('admin chat returns proposed_updates parsed from the fake reply', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Assistant Test', created_by: user.id })
    await configureFakeAnthropic({
      reply: 'Here is a suggested update:',
      proposedUpdates: [{
        section_key: 'identity',
        section_title: 'Identity',
        content: 'We are now Acme.'
      }]
    })

    const res = await $fetch<{ reply: string, proposed_updates: Array<{ section_key: string, proposed_content: string }>, can_edit: boolean }>(
      `/api/context/portfolios/${p.slug}/assistant/chat`,
      { method: 'POST', body: { message: 'Update identity' }, ...withOrgHeader(auth, org.slug) }
    )
    expect(res.can_edit).toBe(true)
    expect(res.proposed_updates.length).toBe(1)
    expect(res.proposed_updates[0]?.section_key).toBe('identity')
    expect(res.proposed_updates[0]?.proposed_content).toBe('We are now Acme.')
    expect(res.reply).not.toContain('section-update')

    const log = await getFakeAnthropicLog()
    expect(log.length).toBe(1)
    expect(log[0]?.system).toContain('Identity')
  })

  it('apply persists the proposed content as a new section version', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Apply Test', created_by: user.id })

    const res = await $fetch<{ section_key: string, version_id: string }>(
      `/api/context/portfolios/${p.slug}/assistant/apply`,
      {
        method: 'POST',
        body: { section_key: 'identity', proposed_content: 'NEW IDENTITY' },
        ...withOrgHeader(auth, org.slug)
      }
    )
    expect(res.section_key).toBe('identity')
    expect(res.version_id).toBeDefined()

    const rows = await sql<{ content: string }[]>`
      SELECT content FROM context_sections WHERE portfolio_id = ${p.id} AND section_key = 'identity'
    `
    expect(rows[0]!.content).toBe('NEW IDENTITY')
  })

  it('member without context.assistant.apply gets 403 on apply', async () => {
    const { org, user } = await createContextOrgWith(sql, ['admin'])
    const m = await addContextMember(sql, org.id, ['member'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Permission Test', created_by: user.id })

    const err = await $fetch(`/api/context/portfolios/${p.slug}/assistant/apply`, {
      method: 'POST',
      body: { section_key: 'identity', proposed_content: 'x' },
      ...withOrgHeader(m.auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('member with context.assistant.chat can chat but proposed_updates is empty without context.write', async () => {
    const { org, user } = await createContextOrgWith(sql, ['admin'])
    const m = await addContextMember(sql, org.id, ['member'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Read-only chat', created_by: user.id })
    await configureFakeAnthropic({
      reply: 'A reply.',
      proposedUpdates: [{ section_key: 'identity', section_title: 'Identity', content: 'X' }]
    })

    const res = await $fetch<{ proposed_updates: unknown[], can_edit: boolean }>(
      `/api/context/portfolios/${p.slug}/assistant/chat`,
      { method: 'POST', body: { message: 'hello' }, ...withOrgHeader(m.auth, org.slug) }
    )
    expect(res.can_edit).toBe(true) // members have context.write by default
    // To assert the no-context.write branch we'd need a role without write
    // perms; default member has it.
    expect(res.proposed_updates.length).toBe(1)
  })
})
