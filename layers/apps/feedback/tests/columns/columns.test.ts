// Columns endpoints — global state, NOT tenant-scoped. Authenticated read for
// anyone; admin-only mutations (rename, WIP limit, reorder). Mandatory columns
// (BACKLOG, DONE) can't be renamed even by an operator admin.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupFeedbackTestData,
  createFeedbackOrgWith,
  createFeedbackUser,
  getAuthHeaders,
  withOrgHeader,
  getColumnByName
} from '../helpers'

describe('feedback columns endpoints', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    // Restore canonical column state for the next test — rename / WIP
    // mutations bleed across tests since columns is global state.
    await sql`UPDATE columns SET name = 'PLANNING' WHERE position = 3`
    await sql`UPDATE columns SET name = 'BUILDING' WHERE position = 4`
    await sql`UPDATE columns SET name = 'TESTING' WHERE position = 5`
    await sql`UPDATE columns SET wip_limit = NULL`
    await cleanupFeedbackTestData(sql)
  })

  it('GET /api/feedback/columns: any authenticated user lists all columns', async () => {
    const { auth } = await createFeedbackOrgWith(sql, ['member'])
    const res = await $fetch<Array<{ id: string, name: string, position: number }>>('/api/feedback/columns', auth)
    // Migration seeds 7 columns.
    expect(res.length).toBe(7)
    expect(res[0]!.name).toBe('FEEDBACK INBOX')
    expect(res[res.length - 1]!.name).toBe('ARCHIVE')
  })

  it('GET /columns: 401 without auth', async () => {
    const err = await $fetch('/api/feedback/columns').catch(e => e)
    expect(err.statusCode).toBe(401)
  })

  it('PATCH /:id: operator admin renames a non-mandatory column', async () => {
    const adminUser = await createFeedbackUser(sql, { is_admin: true })
    const auth = getAuthHeaders(adminUser)
    const planning = await getColumnByName(sql, 'PLANNING')

    const res = await $fetch<{ id: string, name: string }>(`/api/feedback/columns/${planning.id}`, {
      method: 'PATCH',
      body: { name: 'PLANNED' },
      ...auth
    })
    expect(res.name).toBe('PLANNED')

    // Restore handled by afterEach.
    await sql`UPDATE columns SET name = 'PLANNING' WHERE id = ${planning.id}`
  })

  it('PATCH /:id: 400 attempting to rename mandatory column (BACKLOG)', async () => {
    const adminUser = await createFeedbackUser(sql, { is_admin: true })
    const auth = getAuthHeaders(adminUser)
    const backlog = await getColumnByName(sql, 'BACKLOG')

    const err = await $fetch(`/api/feedback/columns/${backlog.id}`, {
      method: 'PATCH',
      body: { name: 'NEWNAME' },
      ...auth
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('PATCH /:id: non-admin org member renaming is blocked (requireOperatorAdmin)', async () => {
    const { auth } = await createFeedbackOrgWith(sql, ['admin'])
    const planning = await getColumnByName(sql, 'PLANNING')

    // Org admin is NOT the same as operator admin. The route gates rename
    // behind requireOperatorAdmin (users.is_admin), so this should fail.
    const err = await $fetch(`/api/feedback/columns/${planning.id}`, {
      method: 'PATCH',
      body: { name: 'XYZ' },
      ...auth
    }).catch(e => e)
    // requireOperatorAdmin returns 401/403 — test the >= 400 contract.
    expect([401, 403]).toContain(err.statusCode)
  })

  it('PATCH /:id: 404 when column not found', async () => {
    const adminUser = await createFeedbackUser(sql, { is_admin: true })
    const auth = getAuthHeaders(adminUser)
    const err = await $fetch('/api/feedback/columns/00000000-0000-0000-0000-000000000000', {
      method: 'PATCH',
      body: { is_collapsed: true },
      ...auth
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('PATCH /:id: 400 when no fields supplied', async () => {
    const adminUser = await createFeedbackUser(sql, { is_admin: true })
    const auth = getAuthHeaders(adminUser)
    const planning = await getColumnByName(sql, 'PLANNING')

    const err = await $fetch(`/api/feedback/columns/${planning.id}`, {
      method: 'PATCH',
      body: {},
      ...auth
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('PATCH /:id: is_collapsed toggle does NOT require operator admin (writes are gated only on rename)', async () => {
    const { auth } = await createFeedbackOrgWith(sql, ['admin'])
    const planning = await getColumnByName(sql, 'PLANNING')
    // No X-Active-Org header — this route is global, not org-scoped. Sending
    // an X-Active-Org would route through tenancy middleware which 404s on
    // unknown slugs.
    const res = await $fetch<{ is_collapsed: boolean }>(`/api/feedback/columns/${planning.id}`, {
      method: 'PATCH',
      body: { is_collapsed: true },
      ...auth
    })
    expect(res.is_collapsed).toBe(true)

    // restore
    await sql`UPDATE columns SET is_collapsed = false WHERE id = ${planning.id}`
  })

  it('PATCH /:id/wip: operator admin sets wip_limit; non-negative number or null only', async () => {
    const adminUser = await createFeedbackUser(sql, { is_admin: true })
    const auth = getAuthHeaders(adminUser)
    const planning = await getColumnByName(sql, 'PLANNING')

    const res = await $fetch<{ wip_limit: number | null }>(`/api/feedback/columns/${planning.id}/wip`, {
      method: 'PATCH',
      body: { wip_limit: 3 },
      ...auth
    })
    expect(res.wip_limit).toBe(3)

    const cleared = await $fetch<{ wip_limit: number | null }>(`/api/feedback/columns/${planning.id}/wip`, {
      method: 'PATCH',
      body: { wip_limit: null },
      ...auth
    })
    expect(cleared.wip_limit).toBeNull()

    const badNeg = await $fetch(`/api/feedback/columns/${planning.id}/wip`, {
      method: 'PATCH',
      body: { wip_limit: -1 },
      ...auth
    }).catch(e => e)
    expect(badNeg.statusCode).toBe(400)
  })

  it('PATCH /:id/wip: 400 when wip_limit key missing entirely', async () => {
    const adminUser = await createFeedbackUser(sql, { is_admin: true })
    const auth = getAuthHeaders(adminUser)
    const planning = await getColumnByName(sql, 'PLANNING')
    const err = await $fetch(`/api/feedback/columns/${planning.id}/wip`, {
      method: 'PATCH',
      body: {},
      ...auth
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('PATCH /reorder: operator admin swaps two columns\' positions', async () => {
    const adminUser = await createFeedbackUser(sql, { is_admin: true })
    const auth = getAuthHeaders(adminUser)
    const planning = await getColumnByName(sql, 'PLANNING')
    const building = await getColumnByName(sql, 'BUILDING')

    const res = await $fetch<Array<{ id: string, name: string, position: number }>>(
      '/api/feedback/columns/reorder',
      {
        method: 'PATCH',
        body: { draggedColumnId: planning.id, targetColumnId: building.id },
        ...auth
      }
    )

    // Returned ordered by position; swapped pair now has its positions flipped.
    const planningRow = res.find(r => r.id === planning.id)
    const buildingRow = res.find(r => r.id === building.id)
    expect(planningRow!.position).toBe(building.position)
    expect(buildingRow!.position).toBe(planning.position)

    // restore: swap them back
    await sql`UPDATE columns SET position = ${planning.position} WHERE id = ${planning.id}`
    await sql`UPDATE columns SET position = ${building.position} WHERE id = ${building.id}`
  })

  it('PATCH /reorder: 400 without both ids', async () => {
    const adminUser = await createFeedbackUser(sql, { is_admin: true })
    const auth = getAuthHeaders(adminUser)
    const err = await $fetch('/api/feedback/columns/reorder', {
      method: 'PATCH',
      body: { draggedColumnId: 'x' },
      ...auth
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('PATCH /reorder: non-admin blocked', async () => {
    const { auth } = await createFeedbackOrgWith(sql, ['admin'])
    const planning = await getColumnByName(sql, 'PLANNING')
    const building = await getColumnByName(sql, 'BUILDING')
    const err = await $fetch('/api/feedback/columns/reorder', {
      method: 'PATCH',
      body: { draggedColumnId: planning.id, targetColumnId: building.id },
      ...auth
    }).catch(e => e)
    expect([401, 403]).toContain(err.statusCode)
  })
})
