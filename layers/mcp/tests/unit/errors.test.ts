import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { mcpError } from '../../server/mcp-layer/errors'

describe('mcpError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('maps a ZodError to a flat-fields message', () => {
    const schema = z.object({ slug: z.string().min(3), count: z.number().int() })
    const result = schema.safeParse({ slug: 'a', count: 'x' })
    if (result.success) throw new Error('expected parse failure')

    const out = mcpError(result.error)
    expect(out.isError).toBe(true)
    expect(out.content[0]!.text).toMatch(/slug/)
    expect(out.content[0]!.text).toMatch(/count/)
  })

  it('maps an h3 400 error to its detail message', () => {
    const err = { statusCode: 400, statusMessage: 'slug is required' }
    const out = mcpError(err)
    expect(out.isError).toBe(true)
    expect(out.content[0]!.text).toBe('slug is required')
  })

  it('maps an h3 403 to a permission-style message', () => {
    const err = { statusCode: 403 }
    const out = mcpError(err)
    expect(out.content[0]!.text).toMatch(/permission/i)
  })

  it('maps an h3 404 with a known entity to "<entity> not found"', () => {
    const err = { statusCode: 404, data: { entity: 'page' } }
    const out = mcpError(err)
    expect(out.content[0]!.text).toBe('page not found')
  })

  it('maps an h3 404 without entity to a generic not-found', () => {
    const err = { statusCode: 404, statusMessage: 'page not found' }
    const out = mcpError(err)
    expect(out.content[0]!.text).toMatch(/not found/i)
  })

  it('maps an h3 409 to its detail', () => {
    const err = { statusCode: 409, statusMessage: 'slug already taken' }
    const out = mcpError(err)
    expect(out.content[0]!.text).toBe('slug already taken')
  })

  it('returns "Internal error" for 5xx and never echoes details', () => {
    const err = { statusCode: 500, statusMessage: 'database connection refused at 10.0.0.1' }
    const out = mcpError(err)
    expect(out.content[0]!.text).toBe('Internal error')
    expect(out.content[0]!.text).not.toMatch(/database/)
  })

  it('returns "Internal error" for unknown thrown values', () => {
    const out = mcpError(new TypeError('boom'))
    expect(out.content[0]!.text).toBe('Internal error')
  })

  it('never includes a stack trace in the message', () => {
    const err = new Error('with stack')
    const out = mcpError(err)
    expect(out.content[0]!.text).not.toMatch(/at .*\.test\.ts/)
  })
})
