// Catalog status → per-org app state, the host's per-org view of one app,
// and purging catalog rows of uninstalled layers.
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  cleanupTenancyTestData,
  createOperatorAdmin,
  withOrgHeader
} from '../helpers'

// 'messages' declares no defaultStatus, so a NULL catalog status resolves to 'disabled'.
const APP_ID = 'messages'

interface OrgApp { appId: string, enabled: boolean, lockedByHost: boolean }
interface AppOrg { id: string, enabled: boolean, source: string | null }

describe('app catalog status across orgs', () => {
  const sql = getHostAdminDb()
  let originalStatus: string | null = null

  beforeAll(async () => {
    const [row] = await sql<{ status: string | null }[]>`SELECT status FROM apps WHERE id = ${APP_ID}`
    originalStatus = row?.status ?? null
  })

  afterEach(async () => {
    await sql`UPDATE apps SET status = ${originalStatus} WHERE id = ${APP_ID}`
    await cleanupTenancyTestData(sql)
  })

  async function setStatus(status: string) {
    await sql`UPDATE apps SET status = ${status} WHERE id = ${APP_ID}`
  }

  async function createOrg(auth: { headers: { cookie: string } }, userId: string) {
    const slug = `test-tenancy-${randomUUID().slice(0, 8)}`
    const org = await $fetch<{ id: string }>('/api/admin/orgs', {
      method: 'POST',
      body: { name: 'Defaults Org', slug, initialAdminUserId: userId },
      ...auth
    })
    const orgApp = async () => {
      const { apps } = await $fetch<{ apps: OrgApp[] }>(`/api/o/${slug}/apps`, withOrgHeader(auth, slug))
      return apps.find(a => a.appId === APP_ID)!
    }
    return { id: org.id, slug, orgApp }
  }

  it('no stored status and no declared default resolves to disabled', async () => {
    const { auth } = await createOperatorAdmin(sql)
    await sql`UPDATE apps SET status = NULL WHERE id = ${APP_ID}`
    const { apps } = await $fetch<{ apps: { id: string, status: string }[] }>('/api/admin/apps', auth)
    expect(apps.find(a => a.id === APP_ID)!.status).toBe('disabled')
  })

  it('enabled for all: a new org has it on', async () => {
    const { user, auth } = await createOperatorAdmin(sql)
    await setStatus('default')
    const { orgApp } = await createOrg(auth, user.id)
    expect((await orgApp()).enabled).toBe(true)
  })

  it('available to all: off for the org until its admin enables it', async () => {
    const { user, auth } = await createOperatorAdmin(sql)
    await setStatus('available')
    const { slug, orgApp } = await createOrg(auth, user.id)

    const before = await orgApp()
    expect(before.enabled).toBe(false)
    expect(before.lockedByHost).toBe(false)

    await $fetch(`/api/o/${slug}/apps/${APP_ID}/enable`, { method: 'POST', ...withOrgHeader(auth, slug) })
    expect((await orgApp()).enabled).toBe(true)
  })

  it('GET /api/admin/apps/:appId/orgs reflects per-org host toggles', async () => {
    const { user, auth } = await createOperatorAdmin(sql)
    await setStatus('available')
    const org = await createOrg(auth, user.id)

    const find = async () => {
      const { orgs } = await $fetch<{ orgs: AppOrg[] }>(`/api/admin/apps/${APP_ID}/orgs`, auth)
      return orgs.find(o => o.id === org.id)!
    }
    expect((await find()).enabled).toBe(false)

    await $fetch(`/api/admin/orgs/${org.id}/apps/${APP_ID}/enable`, { method: 'POST', ...auth })
    const after = await find()
    expect(after.enabled).toBe(true)
    expect(after.source).toBe('host')
  })

  it('DELETE /api/admin/apps/:appId purges an uninstalled app, refuses an installed one', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const orphanId = `test-tenancy-orphan-${randomUUID().slice(0, 8)}`
    await sql`INSERT INTO apps (id, status) VALUES (${orphanId}, 'available')`

    await $fetch(`/api/admin/apps/${orphanId}`, { method: 'DELETE', ...auth })
    const rows = await sql`SELECT 1 FROM apps WHERE id = ${orphanId}`
    expect(rows.length).toBe(0)

    const err = await $fetch(`/api/admin/apps/${APP_ID}`, { method: 'DELETE', ...auth }).catch(e => e)
    expect(err.statusCode).toBe(409)
  })
})
