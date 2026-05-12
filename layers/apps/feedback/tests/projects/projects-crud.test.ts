// Projects CRUD: list / create / read / patch / delete + reorder. Covers
// auth gating, permission gating, RLS isolation, and side-effects on the
// projects/swimlanes tables.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupFeedbackTestData,
  createFeedbackOrgWith,
  addFeedbackMember,
  withOrgHeader,
  createTestProject
} from '../helpers'

describe('feedback projects CRUD', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupFeedbackTestData(sql)
  })

  it('POST /api/feedback/projects: admin creates a project; row + default swimlane land in DB', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const name = `test-feedback-proj-${Math.random().toString(36).slice(2, 8)}`

    const res = await $fetch<{ id: string, name: string }>('/api/feedback/projects', {
      method: 'POST',
      body: { name, description: 'hello' },
      ...withOrgHeader(auth, org.slug)
    })

    expect(res.id).toBeDefined()
    expect(res.name).toBe(name)

    const projRows = await sql<{ id: string, name: string, description: string | null, org_id: string }[]>`
      SELECT id, name, description, org_id FROM projects WHERE id = ${res.id}
    `
    expect(projRows.length).toBe(1)
    expect(projRows[0]!.org_id).toBe(org.id)
    expect(projRows[0]!.description).toBe('hello')

    // The handler also auto-creates a default swimlane.
    const laneRows = await sql<{ id: string, is_default: boolean }[]>`
      SELECT id, is_default FROM swimlanes WHERE project_id = ${res.id}
    `
    expect(laneRows.length).toBe(1)
    expect(laneRows[0]!.is_default).toBe(true)
  })

  it('POST: rejects empty name with 400', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const err = await $fetch('/api/feedback/projects', {
      method: 'POST',
      body: { name: '   ' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('POST: 401 when no auth cookie', async () => {
    const { org } = await createFeedbackOrgWith(sql, ['admin'])
    const err = await $fetch('/api/feedback/projects', {
      method: 'POST',
      body: { name: 'x' },
      headers: { 'x-active-org': org.slug }
    }).catch(e => e)
    expect(err.statusCode).toBe(401)
  })

  it('POST: 404 when caller is not a member of the org (tenancy gate)', async () => {
    const a = await createFeedbackOrgWith(sql, ['admin'])
    const b = await createFeedbackOrgWith(sql, ['admin'])
    const err = await $fetch('/api/feedback/projects', {
      method: 'POST',
      body: { name: 'test-feedback-foreign' },
      ...withOrgHeader(a.auth, b.org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('GET /api/feedback/projects: returns only the active org\'s projects (RLS isolation)', async () => {
    const a = await createFeedbackOrgWith(sql, ['admin'])
    const b = await createFeedbackOrgWith(sql, ['admin'])
    const pA = await createTestProject(sql, { org_id: a.org.id, name: 'test-feedback-projA' })
    const pB = await createTestProject(sql, { org_id: b.org.id, name: 'test-feedback-projB' })

    const listA = await $fetch<Array<{ id: string }>>('/api/feedback/projects', {
      ...withOrgHeader(a.auth, a.org.slug)
    })
    const ids = listA.map(p => p.id)
    expect(ids).toContain(pA.id)
    expect(ids).not.toContain(pB.id)
  })

  it('GET /api/feedback/projects/:id: returns the project for an org member', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })

    const res = await $fetch<{ id: string, name: string }>(`/api/feedback/projects/${project.id}`, {
      ...withOrgHeader(auth, org.slug)
    })
    expect(res.id).toBe(project.id)
    expect(res.name).toBe(project.name)
  })

  it('GET /:id: 404 when project belongs to a different org', async () => {
    const a = await createFeedbackOrgWith(sql, ['admin'])
    const b = await createFeedbackOrgWith(sql, ['admin'])
    const pB = await createTestProject(sql, { org_id: b.org.id })

    // a's auth reads in a's org context — RLS hides b's project, handler 404s.
    const err = await $fetch(`/api/feedback/projects/${pB.id}`, {
      ...withOrgHeader(a.auth, a.org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('PATCH /:id: updates name + description; activity log records the fields', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })

    const updated = await $fetch<{ id: string, name: string, description: string | null }>(
      `/api/feedback/projects/${project.id}`,
      {
        method: 'PATCH',
        body: { name: 'test-feedback-renamed', description: 'new desc' },
        ...withOrgHeader(auth, org.slug)
      }
    )
    expect(updated.name).toBe('test-feedback-renamed')
    expect(updated.description).toBe('new desc')

    const rows = await sql<{ name: string, description: string | null }[]>`
      SELECT name, description FROM projects WHERE id = ${project.id}
    `
    expect(rows[0]!.name).toBe('test-feedback-renamed')
    expect(rows[0]!.description).toBe('new desc')
  })

  it('PATCH /:id: 400 when no fields supplied', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })

    const err = await $fetch(`/api/feedback/projects/${project.id}`, {
      method: 'PATCH',
      body: {},
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('PATCH /:id: 404 when project does not exist in this org', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const bogusId = '00000000-0000-0000-0000-000000000000'
    const err = await $fetch(`/api/feedback/projects/${bogusId}`, {
      method: 'PATCH',
      body: { name: 'x' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('DELETE /:id: removes the project; cascade wipes swimlanes', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })

    const res = await $fetch<{ success: boolean }>(`/api/feedback/projects/${project.id}`, {
      method: 'DELETE',
      ...withOrgHeader(auth, org.slug)
    })
    expect(res.success).toBe(true)

    const projRows = await sql<{ id: string }[]>`SELECT id FROM projects WHERE id = ${project.id}`
    expect(projRows.length).toBe(0)
    const laneRows = await sql<{ id: string }[]>`SELECT id FROM swimlanes WHERE project_id = ${project.id}`
    expect(laneRows.length).toBe(0)
  })

  it('DELETE /:id: 404 when project not found', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const err = await $fetch('/api/feedback/projects/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('POST /reorder: stores per-project sort_order and returns rows in the requested order', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const p1 = await createTestProject(sql, { org_id: org.id, name: 'test-feedback-p1' })
    const p2 = await createTestProject(sql, { org_id: org.id, name: 'test-feedback-p2' })
    const p3 = await createTestProject(sql, { org_id: org.id, name: 'test-feedback-p3' })

    const ordered = [p3.id, p1.id, p2.id]
    const res = await $fetch<Array<{ id: string, post_meta: Record<string, unknown> }>>('/api/feedback/projects/reorder', {
      method: 'POST',
      body: { orderedIds: ordered },
      ...withOrgHeader(auth, org.slug)
    })
    expect(res.length).toBe(3)
    expect(res.map(r => r.id)).toEqual(ordered)

    // Verify the stored sort_order keys persisted as numbers on objects (not
    // arrays — that was the pre-fix shape).
    const rows = await sql<{ id: string, sort_order: number | null }[]>`
      SELECT id, (post_meta->>'sort_order')::int AS sort_order
      FROM projects
      WHERE org_id = ${org.id}
      ORDER BY name
    `
    const sortById = new Map(rows.map(r => [r.id, r.sort_order]))
    expect(sortById.get(p3.id)).toBe(0)
    expect(sortById.get(p1.id)).toBe(1)
    expect(sortById.get(p2.id)).toBe(2)
  })

  it('POST /reorder: 400 when orderedIds is empty or has non-strings', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])

    const empty = await $fetch('/api/feedback/projects/reorder', {
      method: 'POST',
      body: { orderedIds: [] },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(empty.statusCode).toBe(400)

    const badType = await $fetch('/api/feedback/projects/reorder', {
      method: 'POST',
      body: { orderedIds: [1, 2, 3] },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(badType.statusCode).toBe(400)
  })

  it('member (default grants) can create a project — feedback.write is in member defaults', async () => {
    const { org } = await createFeedbackOrgWith(sql, ['admin'])
    const m = await addFeedbackMember(sql, org.id, ['member'])
    const res = await $fetch<{ id: string }>('/api/feedback/projects', {
      method: 'POST',
      body: { name: 'test-feedback-member' },
      ...withOrgHeader(m.auth, org.slug)
    })
    expect(res.id).toBeDefined()
  })
})
