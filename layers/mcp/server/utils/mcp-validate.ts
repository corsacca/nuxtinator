import type { ZodSchema } from 'zod'

// Zod-parses a tool's input. Throws the underlying ZodError on failure so the
// dispatcher's catch can route through the shared mcpError mapper.
export async function validateInput<T>(input: unknown, schema: ZodSchema<T>): Promise<T> {
  return await schema.parseAsync(input)
}
