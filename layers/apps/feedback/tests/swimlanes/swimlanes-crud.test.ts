// Swimlanes CRUD: list / create / delete. Default-lane invariant + card
// migration on delete are the interesting edges here.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupFeedbackTestData,
  createFeedbackOrgWith,
  withOrgHeader,
  createTestProject,
  createTestSwimlane,
  createTestCard,
  getColumnByName
} from '../helpers'

describe('feedback swimlanes CRUD', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupFeedbackTestData(sql)
  })

  it('GET /api/feedback/swimlanes: 400 when project_id missing', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const err = await $fetch('/api/feedback/swimlanes', {
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('GET /swimlanes?project_id=X: returns lanes for the project including the auto-created default', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })
    await createTestSwimlane(sql, { org_id: org.id, project_id: project.id, name: 'lane2', position: 5 })

    const res = await $fetch<Array<{ id: string, name: string, is_default: boolean }>>(
      '/api/feedback/swimlanes',
      { query: { project_id: project.id }, ...withOrgHeader(auth, org.slug) }
    )
    expect(res.length).toBe(2)
    expect(res.some(l => l.is_default && l.name === 'default')).toBe(true)
    expect(res.some(l => l.name === 'lane2')).toBe(true)
  })

  it('POST /swimlanes: creates a non-default lane', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })

    const res = await $fetch<{ id: string, is_default: boolean, name: string }>('/api/feedback/swimlanes', {
      method: 'POST',
      body: { project_id: project.id, name: 'test-feedback-lane-new' },
      ...withOrgHeader(auth, org.slug)
    })
    expect(res.id).toBeDefined()
    expect(res.is_default).toBe(false)
    expect(res.name).toBe('test-feedback-lane-new')
  })

  it('POST: 400 without project_id or name', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })

    const noProj = await $fetch('/api/feedback/swimlanes', {
      method: 'POST',
      body: { name: 'x' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(noProj.statusCode).toBe(400)

    const noName = await $fetch('/api/feedback/swimlanes', {
      method: 'POST',
      body: { project_id: project.id, name: '' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(noName.statusCode).toBe(400)
  })

  it('DELETE /:id: removes a non-default swimlane and migrates its cards to the default lane', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })
    const extra = await createTestSwimlane(sql, { org_id: org.id, project_id: project.id, name: 'doomed' })
    const backlog = await getColumnByName(sql, 'BACKLOG')
    const card = await createTestCard(sql, {
      org_id: org.id,
      project_id: project.id,
      swimlane_id: extra.id,
      column_id: backlog.id,
      title: 'migrate me'
    })

    const res = await $fetch<{ success: boolean, default_swimlane_id: string }>(
      `/api/feedback/swimlanes/${extra.id}`,
      { method: 'DELETE', ...withOrgHeader(auth, org.slug) }
    )
    expect(res.success).toBe(true)
    expect(res.default_swimlane_id).toBe(project.default_swimlane_id)

    const cardRows = await sql<{ swimlane_id: string }[]>`
      SELECT swimlane_id FROM cards WHERE id = ${card.id}
    `
    expect(cardRows[0]!.swimlane_id).toBe(project.default_swimlane_id)

    const laneRows = await sql<{ id: string }[]>`SELECT id FROM swimlanes WHERE id = ${extra.id}`
    expect(laneRows.length).toBe(0)
  })

  it('DELETE /:id: 400 when trying to delete the default swimlane', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })

    const err = await $fetch(`/api/feedback/swimlanes/${project.default_swimlane_id}`, {
      method: 'DELETE',
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('DELETE /:id: 404 when swimlane not found', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const err = await $fetch('/api/feedback/swimlanes/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })
})
