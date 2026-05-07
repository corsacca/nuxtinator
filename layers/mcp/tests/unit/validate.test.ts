import { describe, it, expect } from 'vitest'
import { z, ZodError } from 'zod'
import { validateInput } from '../../server/utils/mcp-validate'

describe('validateInput', () => {
  it('returns parsed input on a valid payload', async () => {
    const schema = z.object({ slug: z.string().min(1), limit: z.number().int().default(10) })
    const out = await validateInput({ slug: 'abc' }, schema)
    expect(out).toEqual({ slug: 'abc', limit: 10 })
  })

  it('throws ZodError on a bad payload', async () => {
    const schema = z.object({ slug: z.string().min(3) })
    await expect(validateInput({ slug: 'a' }, schema)).rejects.toBeInstanceOf(ZodError)
  })

  it('rejects unknown keys when schema is .strict()', async () => {
    const schema = z.object({ slug: z.string() }).strict()
    await expect(validateInput({ slug: 'a', stowaway: 1 }, schema)).rejects.toBeInstanceOf(ZodError)
  })
})
