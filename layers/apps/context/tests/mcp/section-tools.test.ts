// create_portfolio / create_section / delete_section driven through the real
// /mcp transport: choosing built-ins at creation, deleting a built-in, and
// bringing it back by key.
import { describe, it, expect, afterEach } from 'vitest'
import {
  getHostAdminDb,
  cleanupContextTestData,
  createContextUser,
  createContextOrg,
  addTestMembership,
  createTestPortfolio,
  seedTestSection,
  issueMcpBearer,
  callMcpTool
} from '../helpers'
import { CONTEXT_SECTIONS } from '../../server/utils/section-catalog'

const sql = getHostAdminDb()

async function setupAdmin() {
  const user = await createContextUser(sql)
  const org = await createContextOrg(sql)
  await addTestMembership(sql, { user_id: user.id, org_id: org.id, roles: ['admin'] })
  const token = await issueMcpBearer(sql, user.id, ['context.read', 'context.write', 'context.portfolio.create', 'context.section.custom'])
  return { user, org, token }
}

async function listKeys(token: string, org: string, portfolioId: string): Promise<string[]> {
  const result = await callMcpTool(token, 'list_sections', { org, portfolio_id: portfolioId })
  expect(result.isError, result.content[0]?.text).toBeFalsy()
  return (result.structuredContent?.sections as Array<{ key: string }>).map(s => s.key)
}

describe('MCP section definition tools', () => {
  afterEach(async () => {
    await cleanupContextTestData(sql)
    await sql`DELETE FROM oauth_clients WHERE client_id LIKE 'test-context-%'`
  })

  it('create_portfolio honours builtin_sections', async () => {
    const { org, token } = await setupAdmin()

    const some = await callMcpTool(token, 'create_portfolio', { org: org.slug, name: 'test-context Some', builtin_sections: ['team', 'identity'] })
    expect(some.isError, some.content[0]?.text).toBeFalsy()
    const someId = (some.structuredContent?.portfolio as { id: string }).id
    expect(await listKeys(token, org.slug, someId)).toEqual(['identity', 'team'])

    const all = await callMcpTool(token, 'create_portfolio', { org: org.slug, name: 'test-context All' })
    const allId = (all.structuredContent?.portfolio as { id: string }).id
    expect(await listKeys(token, org.slug, allId)).toEqual(CONTEXT_SECTIONS.map(s => s.key))

    const bad = await callMcpTool(token, 'create_portfolio', { org: org.slug, name: 'test-context Bad', builtin_sections: ['roadmap'] })
    expect(bad.isError).toBe(true)
    expect(bad.content[0]?.text).toContain('roadmap')
  })

  it('delete_section removes a built-in; its key stops resolving until create_section adds it back', async () => {
    const { user, org, token } = await setupAdmin()
    const portfolio = await createTestPortfolio(sql, { org_id: org.id, name: 'MCP Delete', created_by: user.id })
    await seedTestSection(sql, { portfolio_id: portfolio.id, section_key: 'team', content: 'Alice', last_edited_by: user.id })

    const deleted = await callMcpTool(token, 'delete_section', { org: org.slug, portfolio_id: portfolio.id, section_key: 'team' })
    expect(deleted.isError, deleted.content[0]?.text).toBeFalsy()
    expect(deleted.structuredContent).toMatchObject({ key: 'team', status: 'deleted', is_custom: false, content_retained: true })
    expect(await listKeys(token, org.slug, portfolio.id)).not.toContain('team')

    const read = await callMcpTool(token, 'read_section', { org: org.slug, portfolio_id: portfolio.id, section_key: 'team' })
    expect(read.isError).toBe(true)
    const update = await callMcpTool(token, 'update_section', { org: org.slug, portfolio_id: portfolio.id, section_key: 'team', content: 'x' })
    expect(update.isError).toBe(true)
    const bulk = await callMcpTool(token, 'bulk_read_sections', { org: org.slug, portfolio_id: portfolio.id, section_keys: ['identity', 'team'] })
    expect(bulk.isError).toBe(true)

    const restored = await callMcpTool(token, 'create_section', { org: org.slug, portfolio_id: portfolio.id, key: 'team' })
    expect(restored.isError, restored.content[0]?.text).toBeFalsy()
    expect(restored.structuredContent?.section).toMatchObject({ key: 'team', title: 'Team', is_custom: false })
    const back = await callMcpTool(token, 'read_section', { org: org.slug, portfolio_id: portfolio.id, section_key: 'team' })
    expect(back.structuredContent?.content).toBe('Alice')
  })

  it('create_section takes exactly one of key or title', async () => {
    const { user, org, token } = await setupAdmin()
    const portfolio = await createTestPortfolio(sql, { org_id: org.id, name: 'MCP Create', created_by: user.id })

    const custom = await callMcpTool(token, 'create_section', { org: org.slug, portfolio_id: portfolio.id, title: 'Roadmap' })
    expect(custom.isError, custom.content[0]?.text).toBeFalsy()
    expect(custom.structuredContent?.section).toMatchObject({ key: 'roadmap', title: 'Roadmap', is_custom: true })

    const both = await callMcpTool(token, 'create_section', { org: org.slug, portfolio_id: portfolio.id, key: 'team', title: 'Team' })
    expect(both.isError).toBe(true)
    const neither = await callMcpTool(token, 'create_section', { org: org.slug, portfolio_id: portfolio.id })
    expect(neither.isError).toBe(true)
  })
})
