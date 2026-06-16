// GET /api/admin/feedback/:id/attachments — operator-admin attachment listing,
// used by the kanban card panel. The handler wraps `withRecordOrgContext`,
// which resolves the card's owning org via BYPASSRLS adminDb and primes the
// `app.current_org` GUC before reads run.
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

describe('admin feedback attachments', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupFeedbackTestData(sql)
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
    const doing = await getColumnByName(sql, 'DOING')
    const card = await createTestCard(sql, {
      org_id: org.id,
      project_id: project.id,
      swimlane_id: project.default_swimlane_id,
      column_id: doing.id,
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
