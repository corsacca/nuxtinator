// Test helpers for the fake Anthropic client running inside the spawned Nuxt
// server. The fake itself is installed by a Nitro plugin (see
// `server/plugins/test-anthropic.ts`) that activates when
// `CONTEXT_TEST_ANTHROPIC=1` is set in the server process env.
//
// Tests configure per-call behavior over HTTP via the same endpoint exposed
// by that plugin: `/api/_test/context-anthropic`. POST a config to prime the
// next assistant call; GET the call log to assert what the assistant was
// asked.
import { $fetch } from '@nuxt/test-utils/e2e'

export interface FakeReplyConfig {
  reply?: string
  proposedUpdates?: Array<{ section_key: string, section_title: string, content: string }>
}

export interface CapturedCall {
  system: string | undefined
  messages: Array<{ role: 'user' | 'assistant', content: string }>
}

// Prime the next call(s) to the fake Anthropic client. Subsequent
// invocations from the assistant route will return `reply` plus rendered
// section-update blocks for each `proposedUpdates` entry.
export async function configureFakeAnthropic(config: FakeReplyConfig): Promise<void> {
  await $fetch('/api/_test/context-anthropic', {
    method: 'POST',
    body: { ...config }
  })
}

// Read the calls captured by the fake since the last `resetFakeAnthropic`.
export async function getFakeAnthropicLog(): Promise<CapturedCall[]> {
  return await $fetch<CapturedCall[]>('/api/_test/context-anthropic', { method: 'GET' })
}

// Wipe the captured call log and any primed reply.
export async function resetFakeAnthropic(): Promise<void> {
  await $fetch('/api/_test/context-anthropic', { method: 'DELETE' })
}
