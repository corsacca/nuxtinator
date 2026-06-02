// MCP tool registry smoke test — confirms the 8 tools are declared with
// the right scopes and that `update_section`'s optional optimistic-lock
// field is intact. Full dispatch tests live in the MCP layer's own harness
// (which exercises auth / scope gating / rate limits in isolation); driving
// them via the booted Nuxt server here would require an issued OAuth token
// per scope per test, which is overkill for a name/scope smoke.
import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'

const TOOLS_FILE = fileURLToPath(new URL('../../server/mcp/context-tools.ts', import.meta.url))

describe('context MCP tools file', () => {
  it('declares the 8 expected tool names', async () => {
    const src = await fs.readFile(TOOLS_FILE, 'utf8')
    const expected = [
      'list_orgs',
      'list_portfolios',
      'list_sections',
      'read_section',
      'bulk_read_sections',
      'read_organization',
      'update_section',
      'bulk_update_sections'
    ]
    for (const name of expected) {
      expect(src).toContain(`name: '${name}'`)
    }
  })

  it('assigns context.read to all six read tools', async () => {
    const src = await fs.readFile(TOOLS_FILE, 'utf8')
    const readMatches = src.match(/scope:\s*'context\.read'/g) ?? []
    expect(readMatches.length).toBe(6)
  })

  it('assigns context.write to update_section and bulk_update_sections', async () => {
    const src = await fs.readFile(TOOLS_FILE, 'utf8')
    const writeMatches = src.match(/scope:\s*'context\.write'/g) ?? []
    expect(writeMatches.length).toBe(2)
  })

  it('update_section accepts optional last_edited_at for optimistic locking', async () => {
    const src = await fs.readFile(TOOLS_FILE, 'utf8')
    expect(src).toMatch(/last_edited_at:\s*z\.string\(\)\.datetime\(\)\.optional\(\)/)
  })

  // Full per-tool dispatch (auth / OAuth token / write semantics) is covered
  // by the mcp layer's harness; an end-to-end JSON-RPC run from this project
  // would need an OAuth client + access token per scope. Tracked as TODO.
  it.todo('dispatches each read tool via /mcp JSON-RPC with a valid bearer token')
  it.todo('dispatches each write tool via /mcp JSON-RPC under an OAuth-issued token with context.write')
})
