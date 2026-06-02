// Test-only control endpoint for the fake Anthropic client. Refuses to
// serve when `CONTEXT_TEST_ANTHROPIC=1` is unset so this can never be
// reached in production (the plugin wouldn't have installed the fake
// either).
//
// POST   — prime the next call(s) with `{ reply?, proposedUpdates? }`
// GET    — return the captured call log
// DELETE — reset config + clear the log
import { setFakeConfig, getFakeLog, resetFake } from '../../../plugins/test-anthropic'

export default defineEventHandler(async (event) => {
  if (process.env.CONTEXT_TEST_ANTHROPIC !== '1') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const method = event.method
  if (method === 'POST') {
    const body = await readBody(event) as { reply?: string, proposedUpdates?: Array<{ section_key: string, section_title: string, content: string }> }
    setFakeConfig({
      reply: body.reply ?? 'OK.',
      proposedUpdates: body.proposedUpdates ?? []
    })
    return { ok: true }
  }
  if (method === 'GET') {
    return getFakeLog()
  }
  if (method === 'DELETE') {
    resetFake()
    return { ok: true }
  }
  throw createError({ statusCode: 405, statusMessage: 'Method not allowed' })
})
