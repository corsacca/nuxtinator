// PATCH /api/admin/feedback/:id — operator-admin triage of feedback cards.
// Updates status, admin_notes, external_reference, tags in post_meta.
// GET /api/admin/feedback/:id/attachments — operator-admin attachment listing.
//
// Both endpoints now wrap their handler in `withRecordOrgContext` which
// resolves the card's owning org via BYPASSRLS adminDb and primes the
// `app.current_org` GUC before reads/writes run.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  cleanupFeedbackTestData,
  createFeedbackOrgWith,
  createFeedbackUser,
  getAuthHeaders,
  addTestMembership,
  withOrgHeader,
  createTestProject,
  createTestCard,
  getColumnByName
} from '../helpers'

describe('admin feedback triage', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupFeedbackTestData(sql)
  })

  it('PATCH /admin/feedback/:id: operator admin sets status / admin_notes / external_reference / tags', async () => {
    // Build an org, then attach an operator-admin user that's a member.
    const { org } = await createFeedbackOrgWith(sql, ['admin'])
    const adminUser = await createFeedbackUser(sql, { is_admin: true })
    await addTestMembership(sql, { user_id: adminUser.id, org_id: org.id, roles: ['admin'] })
    const auth = getAuthHeaders(adminUser)

    const project = await createTestProject(sql, { org_id: org.id })
    const inbox = await getColumnByName(sql, 'FEEDBACK INBOX')
    const card = await createTestCard(sql, {
      org_id: org.id,
      project_id: project.id,
      swimlane_id: project.default_swimlane_id,
      column_id: inbox.id,
      post_type: 'feedback',
      post_meta: { feedback_sub_type: 'bug' }
    })

    const res = await $fetch<{ id: string, status: string, admin_notes: string | null, external_reference: string | null, tags: string[] }>(
      `/api/admin/feedback/${card.id}`,
      {
        method: 'PATCH',
        body: {
          status: 'in_progress',
          admin_notes: 'looking into it',
          external_reference: 'TICKET-123',
          tags: ['urgent', 'mobile']
        },
        ...withOrgHeader(auth, org.slug)
      }
    )
    expect(res.status).toBe('in_progress')
    expect(res.admin_notes).toBe('looking into it')
    expect(res.external_reference).toBe('TICKET-123')
    expect(res.tags).toEqual(['urgent', 'mobile'])

    const rows = await sql<{ post_meta: any }[]>`
      SELECT post_meta FROM cards WHERE id = ${card.id}
    `
    const meta = rows[0]!.post_meta as Record<string, any>
    expect(meta.status).toBe('in_progress')
    expect(meta.status_changed_by_user_id).toBe(adminUser.id)
  })

  it('PATCH /admin/feedback/:id: 422 for an invalid status enum value', async () => {
    const { org } = await createFeedbackOrgWith(sql, ['admin'])
    const adminUser = await createFeedbackUser(sql, { is_admin: true })
    await addTestMembership(sql, { user_id: adminUser.id, org_id: org.id, roles: ['admin'] })
    const auth = getAuthHeaders(adminUser)

    const project = await createTestProject(sql, { org_id: org.id })
    const inbox = await getColumnByName(sql, 'FEEDBACK INBOX')
    const card = await createTestCard(sql, {
      org_id: org.id,
      project_id: project.id,
      swimlane_id: project.default_swimlane_id,
      column_id: inbox.id,
      post_type: 'feedback'
    })

    const err = await $fetch(`/api/admin/feedback/${card.id}`, {
      method: 'PATCH',
      body: { status: 'bogus' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(422)
  })

  it('PATCH /admin/feedback/:id: 400 when target is a regular task card (not feedback)', async () => {
    const { org } = await createFeedbackOrgWith(sql, ['admin'])
    const adminUser = await createFeedbackUser(sql, { is_admin: true })
    await addTestMembership(sql, { user_id: adminUser.id, org_id: org.id, roles: ['admin'] })
    const auth = getAuthHeaders(adminUser)

    const project = await createTestProject(sql, { org_id: org.id })
    const backlog = await getColumnByName(sql, 'BACKLOG')
    const card = await createTestCard(sql, {
      org_id: org.id,
      project_id: project.id,
      swimlane_id: project.default_swimlane_id,
      column_id: backlog.id,
      post_type: 'task'
    })

    const err = await $fetch(`/api/admin/feedback/${card.id}`, {
      method: 'PATCH',
      body: { admin_notes: 'x' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('PATCH /admin/feedback/:id: 404 for non-existent id', async () => {
    const adminUser = await createFeedbackUser(sql, { is_admin: true })
    const auth = getAuthHeaders(adminUser)
    // Need to be in some org context for the route to find the card via RLS.
    const { org } = await createFeedbackOrgWith(sql, ['admin'])
    await addTestMembership(sql, { user_id: adminUser.id, org_id: org.id, roles: ['admin'] })

    const err = await $fetch(`/api/admin/feedback/${randomUUID()}`, {
      method: 'PATCH',
      body: { status: 'in_progress' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('PATCH /admin/feedback/:id: non-operator-admin blocked', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const project = await createTestProject(sql, { org_id: org.id })
    const inbox = await getColumnByName(sql, 'FEEDBACK INBOX')
    const card = await createTestCard(sql, {
      org_id: org.id,
      project_id: project.id,
      swimlane_id: project.default_swimlane_id,
      column_id: inbox.id,
      post_type: 'feedback'
    })
    const err = await $fetch(`/api/admin/feedback/${card.id}`, {
      method: 'PATCH',
      body: { status: 'in_progress' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect([401, 403]).toContain(err.statusCode)
  })

  it('GET /admin/feedback/:id/attachments: returns empty array for a feedback card with no attachments', async () => {
    const { org } = await createFeedbackOrgWith(sql, ['admin'])
    const adminUser = await createFeedbackUser(sql, { is_admin: true })
    await addTestMembership(sql, { user_id: adminUser.id, org_id: org.id, roles: ['admin'] })
    const auth = getAuthHeaders(adminUser)

    const project = await createTestProject(sql, { org_id: org.id })
    const inbox = await getColumnByName(sql, 'FEEDBACK INBOX')
    const card = await createTestCard(sql, {
      org_id: org.id,
      project_id: project.id,
      swimlane_id: project.default_swimlane_id,
      column_id: inbox.id,
      post_type: 'feedback'
    })

    const res = await $fetch<unknown[]>(`/api/admin/feedback/${card.id}/attachments`, {
      ...withOrgHeader(auth, org.slug)
    })
    expect(Array.isArray(res)).toBe(true)
    expect(res.length).toBe(0)
  })

  it('GET /admin/feedback/:id/attachments: 400 for a non-feedback card', async () => {
    const { org } = await createFeedbackOrgWith(sql, ['admin'])
    const adminUser = await createFeedbackUser(sql, { is_admin: true })
    await addTestMembership(sql, { user_id: adminUser.id, org_id: org.id, roles: ['admin'] })
    const auth = getAuthHeaders(adminUser)

    const project = await createTestProject(sql, { org_id: org.id })
    const backlog = await getColumnByName(sql, 'BACKLOG')
    const card = await createTestCard(sql, {
      org_id: org.id,
      project_id: project.id,
      swimlane_id: project.default_swimlane_id,
      column_id: backlog.id,
      post_type: 'task'
    })

    const err = await $fetch(`/api/admin/feedback/${card.id}/attachments`, {
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('GET /admin/feedback/:id/attachments: non-admin blocked', async () => {
    const { org, auth } = await createFeedbackOrgWith(sql, ['admin'])
    const err = await $fetch(`/api/admin/feedback/${randomUUID()}/attachments`, {
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect([401, 403]).toContain(err.statusCode)
  })
})
