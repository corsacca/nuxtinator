import { describe, it, expect, beforeEach } from 'vitest'
import { assertAllowedOrigin } from '../../server/utils/mcp-origin'
import { setTestOauthConfig } from '../stubs/server/utils/oauth-config'
import { setTestRuntimeConfig } from '../stubs/nitro-globals'

interface FakeEvent {
  headers: Record<string, string>
}

function makeEvent(headers: Record<string, string> = {}): FakeEvent {
  return { headers }
}

describe('assertAllowedOrigin', () => {
  beforeEach(() => {
    setTestOauthConfig({ mcpResource: 'https://api.example.com/mcp' })
    setTestRuntimeConfig({})
  })

  it('allows when Origin header is absent (non-browser clients)', () => {
    expect(() => assertAllowedOrigin(makeEvent() as never)).not.toThrow()
  })

  it("allows when Origin matches the resource's origin", () => {
    const event = makeEvent({ origin: 'https://api.example.com' })
    expect(() => assertAllowedOrigin(event as never)).not.toThrow()
  })

  it('rejects an unrelated Origin in production', () => {
    const original = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const event = makeEvent({ origin: 'https://attacker.example.org' })
      expect(() => assertAllowedOrigin(event as never)).toThrowError(/Forbidden/i)
    }
    finally {
      process.env.NODE_ENV = original
    }
  })

  it('allows http://localhost:* in development', () => {
    const original = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    try {
      expect(() => assertAllowedOrigin(makeEvent({ origin: 'http://localhost:5173' }) as never))
        .not.toThrow()
      expect(() => assertAllowedOrigin(makeEvent({ origin: 'http://127.0.0.1:3000' }) as never))
        .not.toThrow()
    }
    finally {
      process.env.NODE_ENV = original
    }
  })

  it('rejects http://localhost in production', () => {
    const original = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      expect(() => assertAllowedOrigin(makeEvent({ origin: 'http://localhost:5173' }) as never))
        .toThrow()
    }
    finally {
      process.env.NODE_ENV = original
    }
  })

  it('allows entries from runtimeConfig.mcpAdditionalOrigins', () => {
    setTestRuntimeConfig({ mcpAdditionalOrigins: ['https://admin.example.com'] })
    expect(() => assertAllowedOrigin(makeEvent({ origin: 'https://admin.example.com' }) as never))
      .not.toThrow()
  })
})
