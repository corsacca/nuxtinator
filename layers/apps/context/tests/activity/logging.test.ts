// Activity logging: route handlers fire CREATE / UPDATE / DELETE events for
// portfolios + sections + custom sections. The logger is fire-and-forget on
// the default db client so the row may land just after the response returns
// — we poll briefly.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupContextTestData,
  createContextOrgWith,
  createTestPortfolio,
  withOrgHeader
} from '../helpers'

async function poll<T>(fn: () => Promise<T | undefined | null>, timeoutMs = 5000): Promise<T> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const v = await fn()
    if (v) return v
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('poll timed out')
}

describe('activity logging via HTTP routes', () => {
  const sql = getHostAdminDb()
  afterEach(async () => { await cleanupContextTestData(sql) })

  it('CREATE event when portfolios POST succeeds', async () => {
    const { org, auth } = await createContextOrgWith(sql, ['admin'])
    const res = await $fetch<{ id: string }>('/api/context/portfolios', {
      method: 'POST', body: { name: 'Log Create' }, ...withOrgHeader(auth, org.slug)
    })
    const row = await poll(async () => {
      const r = await sql<{ event_type: string }[]>`
        SELECT event_type FROM activity_logs
        WHERE record_id = ${res.id} AND event_type = 'CREATE'
      `
      return r[0]
    })
    expect(row?.event_type).toBe('CREATE')
  })

  it('UPDATE event when section PUT succeeds', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Log Update', created_by: user.id })
    const saved = await $fetch<{ id: string }>(
      `/api/context/portfolios/${p.slug}/sections/identity`,
      { method: 'PUT', body: { content: 'x' }, ...withOrgHeader(auth, org.slug) }
    )
    const row = await poll(async () => {
      const r = await sql<{ event_type: string }[]>`
        SELECT event_type FROM activity_logs
        WHERE record_id = ${saved.id} AND event_type = 'UPDATE'
      `
      return r[0]
    })
    expect(row?.event_type).toBe('UPDATE')
  })

  it('DELETE event when portfolio DELETE succeeds', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Log Delete', created_by: user.id })
    await $fetch(`/api/context/portfolios/${p.slug}`, {
      method: 'DELETE', ...withOrgHeader(auth, org.slug)
    })
    const row = await poll(async () => {
      const r = await sql<{ event_type: string }[]>`
        SELECT event_type FROM activity_logs
        WHERE record_id = ${p.id} AND event_type = 'DELETE'
      `
      return r[0]
    })
    expect(row?.event_type).toBe('DELETE')
  })
})
