// Test-only Nitro plugin. When `CONTEXT_TEST_ANTHROPIC=1` is set in the
// server process env, swaps the real Anthropic client for a fake captured-in-
// memory implementation. The fake's reply + proposed updates are primed per
// test over an HTTP control endpoint (see `server/routes/api/_test/...`).
//
// Without this plugin (env var unset) the production client is used. With
// the env var set but no priming, the fake returns `'OK.'`.
import { setAnthropicClient, type AnthropicClient, type AnthropicCallOpts } from '../utils/anthropic-client'

export interface FakeConfig {
  reply: string
  proposedUpdates: Array<{ section_key: string, section_title: string, content: string }>
}

export interface CapturedCall {
  system: string | undefined
  messages: AnthropicCallOpts['messages']
}

// In-process state. Shared with the test-only HTTP endpoint via the global
// symbol below — Nitro plugins and routes don't share a module instance
// directly because routes are imported lazily.
const STATE_KEY = Symbol.for('context.test.anthropic.state')

interface State {
  config: FakeConfig
  log: CapturedCall[]
}

function defaultConfig(): FakeConfig {
  return { reply: 'OK.', proposedUpdates: [] }
}

function getState(): State {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = { config: defaultConfig(), log: [] }
  }
  return g[STATE_KEY] as State
}

export function setFakeConfig(c: Partial<FakeConfig>): void {
  const s = getState()
  s.config = { ...defaultConfig(), ...c }
}

export function getFakeLog(): CapturedCall[] {
  return [...getState().log]
}

export function resetFake(): void {
  const s = getState()
  s.config = defaultConfig()
  s.log = []
}

function renderUpdateBlocks(updates: FakeConfig['proposedUpdates']): string {
  return updates
    .map(u => '```section-update\n'
      + `SECTION_KEY: ${u.section_key}\n`
      + `SECTION_TITLE: ${u.section_title}\n`
      + '---\n'
      + `${u.content}\n`
      + '```')
    .join('\n\n')
}

const fakeClient: AnthropicClient = {
  async call(opts) {
    const state = getState()
    state.log.push({ system: opts.system, messages: opts.messages })
    const blocks = renderUpdateBlocks(state.config.proposedUpdates)
    return blocks ? `${state.config.reply}\n\n${blocks}` : state.config.reply
  }
}

export default defineNitroPlugin(() => {
  if (process.env.CONTEXT_TEST_ANTHROPIC !== '1') return
  setAnthropicClient(fakeClient)
})
