// Cards CRUD: list / create / read / patch / delete. Covers validation,
// permission gating, RLS isolation, and observable side-effects.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupFeedbackTestData,
  createFeedbackOrgWith,
  withOrgHeader,
  createTestProject,
  createTestCard,
  getColumnByName
} from '../helpers'

describe('feedback cards CRUD', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupFeedbackTestData(sql)
  })

  it('GET /api/feedback/cards: 400 when project_id query param missing', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const err = await $fetch('/api/feedback/cards', {
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('GET /api/feedback/cards?project_id=X: returns only that project\'s cards', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const projectA = await createTestProject(sql, { org_id: org.id })
    const projectB = await createTestProject(sql, { org_id: org.id })
    const backlog = await getColumnByName(sql, 'BACKLOG')
    const cardA = await createTestCard(sql, {
      org_id: org.id,
      project_id: projectA.id,
      swimlane_id: projectA.default_swimlane_id,
      column_id: backlog.id
    })
    await createTestCard(sql, {
      org_id: org.id,
      project_id: projectB.id,
      swimlane_id: projectB.default_swimlane_id,
      column_id: backlog.id
    })

    const res = await $fetch<Array<{ id: string, project_id: string }>>('/api/feedback/cards', {
      query: { project_id: projectA.id },
      ...withOrgHeader(auth, org.slug)
    })
    expect(res.length).toBe(1)
    expect(res[0]!.id).toBe(cardA.id)
  })

  it('POST /api/feedback/cards: creates a card with required fields; row lands in DB', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })
    const backlog = await getColumnByName(sql, 'BACKLOG')

    const res = await $fetch<{ id: string, title: string, post_type: string }>('/api/feedback/cards', {
      method: 'POST',
      body: {
        project_id: project.id,
        swimlane_id: project.default_swimlane_id,
        column_id: backlog.id,
        title: 'test-feedback-new-card',
        post_type: 'bug'
      },
      ...withOrgHeader(auth, org.slug)
    })
    expect(res.id).toBeDefined()
    expect(res.title).toBe('test-feedback-new-card')
    expect(res.post_type).toBe('bug')

    const rows = await sql<{ org_id: string, post_type: string }[]>`
      SELECT org_id, post_type FROM cards WHERE id = ${res.id}
    `
    expect(rows.length).toBe(1)
    expect(rows[0]!.org_id).toBe(org.id)
  })

  it('POST: invalid post_type silently defaults to "task"', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })
    const backlog = await getColumnByName(sql, 'BACKLOG')

    const res = await $fetch<{ post_type: string }>('/api/feedback/cards', {
      method: 'POST',
      body: {
        project_id: project.id,
        swimlane_id: project.default_swimlane_id,
        column_id: backlog.id,
        title: 'x',
        post_type: 'something-bogus'
      },
      ...withOrgHeader(auth, org.slug)
    })
    expect(res.post_type).toBe('task')
  })

  it('POST: 400 when project_id, swimlane_id, or column_id missing', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])

    const missingProject = await $fetch('/api/feedback/cards', {
      method: 'POST',
      body: { title: 'x' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(missingProject.statusCode).toBe(400)
  })

  it('POST: 401 without auth cookie', async () => {
    const { org } = await createFeedbackOrgWith(sql, ['admin'])
    const err = await $fetch('/api/feedback/cards', {
      method: 'POST',
      body: { project_id: 'x', swimlane_id: 'y', column_id: 'z', title: 't' },
      headers: { 'x-active-org': org.slug }
    }).catch(e => e)
    expect(err.statusCode).toBe(401)
  })

  it('GET /api/feedback/cards/:id: returns the card', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })
    const backlog = await getColumnByName(sql, 'BACKLOG')
    const card = await createTestCard(sql, {
      org_id: org.id,
      project_id: project.id,
      swimlane_id: project.default_swimlane_id,
      column_id: backlog.id,
      title: 'fetchable'
    })

    const res = await $fetch<{ id: string, title: string }>(`/api/feedback/cards/${card.id}`, {
      ...withOrgHeader(auth, org.slug)
    })
    expect(res.id).toBe(card.id)
    expect(res.title).toBe('fetchable')
  })

  it('GET /:id: 404 cross-org', async () => {
    const a = await createFeedbackOrgWith(sql, ['admin'])
    const b = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: b.org.id })
    const backlog = await getColumnByName(sql, 'BACKLOG')
    const card = await createTestCard(sql, {
      org_id: b.org.id,
      project_id: project.id,
      swimlane_id: project.default_swimlane_id,
      column_id: backlog.id
    })

    const err = await $fetch(`/api/feedback/cards/${card.id}`, {
      ...withOrgHeader(a.auth, a.org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('PATCH /:id: updates title / description / is_done', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })
    const backlog = await getColumnByName(sql, 'BACKLOG')
    const card = await createTestCard(sql, {
      org_id: org.id,
      project_id: project.id,
      swimlane_id: project.default_swimlane_id,
      column_id: backlog.id
    })

    const updated = await $fetch<{ id: string, title: string, description: string | null, is_done: boolean }>(
      `/api/feedback/cards/${card.id}`,
      {
        method: 'PATCH',
        body: { title: 'edited', description: 'edited desc', is_done: true },
        ...withOrgHeader(auth, org.slug)
      }
    )
    expect(updated.title).toBe('edited')
    expect(updated.description).toBe('edited desc')
    expect(updated.is_done).toBe(true)
  })

  it('PATCH /:id: 400 when no recognised fields supplied', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })
    const backlog = await getColumnByName(sql, 'BACKLOG')
    const card = await createTestCard(sql, {
      org_id: org.id,
      project_id: project.id,
      swimlane_id: project.default_swimlane_id,
      column_id: backlog.id
    })

    // post_type with an invalid value isn't applied; nothing else supplied.
    const err = await $fetch(`/api/feedback/cards/${card.id}`, {
      method: 'PATCH',
      body: { post_type: 'unknownThing' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('PATCH /:id: 404 when card id does not exist (in this org)', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const err = await $fetch('/api/feedback/cards/00000000-0000-0000-0000-000000000000', {
      method: 'PATCH',
      body: { title: 'x' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('DELETE /:id: removes the card', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })
    const backlog = await getColumnByName(sql, 'BACKLOG')
    const card = await createTestCard(sql, {
      org_id: org.id,
      project_id: project.id,
      swimlane_id: project.default_swimlane_id,
      column_id: backlog.id
    })

    const res = await $fetch<{ success: boolean }>(`/api/feedback/cards/${card.id}`, {
      method: 'DELETE',
      ...withOrgHeader(auth, org.slug)
    })
    expect(res.success).toBe(true)

    const rows = await sql<{ id: string }[]>`SELECT id FROM cards WHERE id = ${card.id}`
    expect(rows.length).toBe(0)
  })

  it('PATCH /:id/move: moves a card to a new column; appends to card_column_history', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })
    const backlog = await getColumnByName(sql, 'BACKLOG')
    const planning = await getColumnByName(sql, 'PLANNING')
    const card = await createTestCard(sql, {
      org_id: org.id,
      project_id: project.id,
      swimlane_id: project.default_swimlane_id,
      column_id: backlog.id
    })

    const moved = await $fetch<{ id: string, column_id: string }>(`/api/feedback/cards/${card.id}/move`, {
      method: 'PATCH',
      body: { column_id: planning.id },
      ...withOrgHeader(auth, org.slug)
    })
    expect(moved.column_id).toBe(planning.id)

    const history = await sql<{ column_id: string }[]>`
      SELECT column_id FROM card_column_history WHERE card_id = ${card.id} ORDER BY moved_at DESC LIMIT 1
    `
    expect(history.length).toBe(1)
    expect(history[0]!.column_id).toBe(planning.id)
  })

  it('PATCH /:id/move: cross-project move inserts new card + deletes old', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const projectA = await createTestProject(sql, { org_id: org.id })
    const projectB = await createTestProject(sql, { org_id: org.id })
    const backlog = await getColumnByName(sql, 'BACKLOG')
    const planning = await getColumnByName(sql, 'PLANNING')
    const card = await createTestCard(sql, {
      org_id: org.id,
      project_id: projectA.id,
      swimlane_id: projectA.default_swimlane_id,
      column_id: backlog.id,
      title: 'cross-proj'
    })

    const moved = await $fetch<{ id: string, project_id: string, title: string }>(
      `/api/feedback/cards/${card.id}/move`,
      {
        method: 'PATCH',
        body: {
          column_id: planning.id,
          swimlane_id: projectB.default_swimlane_id,
          project_id: projectB.id
        },
        ...withOrgHeader(auth, org.slug)
      }
    )

    // Server inserts a new row and deletes the old; the returned id is new.
    expect(moved.id).not.toBe(card.id)
    expect(moved.project_id).toBe(projectB.id)
    expect(moved.title).toBe('cross-proj')

    const oldRows = await sql<{ id: string }[]>`SELECT id FROM cards WHERE id = ${card.id}`
    expect(oldRows.length).toBe(0)
  })

  it('PATCH /:id/move: 400 without column_id', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })
    const backlog = await getColumnByName(sql, 'BACKLOG')
    const card = await createTestCard(sql, {
      org_id: org.id,
      project_id: project.id,
      swimlane_id: project.default_swimlane_id,
      column_id: backlog.id
    })

    const err = await $fetch(`/api/feedback/cards/${card.id}/move`, {
      method: 'PATCH',
      body: {},
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('PATCH /:id/move: 404 when card not found', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const backlog = await getColumnByName(sql, 'BACKLOG')
    const err = await $fetch('/api/feedback/cards/00000000-0000-0000-0000-000000000000/move', {
      method: 'PATCH',
      body: { column_id: backlog.id },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })
})
