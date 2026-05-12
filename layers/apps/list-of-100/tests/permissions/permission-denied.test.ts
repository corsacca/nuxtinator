// Permission-gate behavior — 403 for callers whose role lacks the required
// permission.
//
// Defaults grant `list-of-100.read` + `list-of-100.write` to org members.
// To exercise the 403 path we seed a custom role with no permissions, attach
// the user to the org via that role, and assert each endpoint rejects them.
//
// In multi-tenant mode `custom_roles` is org-scoped via RLS; we insert with
// the host_admin (BYPASSRLS) pool and explicit `org_id`.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import {
  getHostAdminDb,
  cleanupListOf100TestData,
  createListOf100OrgWith,
  createListOf100User,
  withOrgHeader,
  getAuthHeaders,
  type TestOrg,
  type TestUser,
  type AuthHeaders
} from '../helpers'

type SqlClient = ReturnType<typeof postgres>

async function createPermlessRole(sql: SqlClient, orgId: string): Promise<string> {
  const name = `test-list-of-100-permless-${randomUUID().slice(0, 8)}`
  await sql`
    INSERT INTO custom_roles (id, name, description, permissions, org_id)
    VALUES (gen_random_uuid(), ${name}, 'no perms for tests', '{}'::text[], ${orgId})
  `
  return name
}

async function attachUserWithRole(
  sql: SqlClient,
  orgId: string,
  roleName: string
): Promise<{ user: TestUser, auth: AuthHeaders }> {
  const user = await createListOf100User(sql)
  await sql`
    INSERT INTO memberships (id, user_id, org_id, roles)
    VALUES (gen_random_uuid(), ${user.id}, ${orgId}, ${[roleName]})
  `
  return { user, auth: getAuthHeaders(user) }
}

describe('list-of-100 permission gates (403 when caller\'s role lacks the permission)', () => {
  const sql = getHostAdminDb()
  afterEach(async () => { await cleanupListOf100TestData(sql) })

  async function setup(): Promise<{ org: TestOrg, permlessAuth: AuthHeaders, permlessUser: TestUser }> {
    const owner = await createListOf100OrgWith(sql, ['admin'])
    const roleName = await createPermlessRole(sql, owner.org.id)
    const attached = await attachUserWithRole(sql, owner.org.id, roleName)
    return { org: owner.org, permlessAuth: attached.auth, permlessUser: attached.user }
  }

  it('POST /contacts → 403 when role grants no `list-of-100.write`', async () => {
    const { org, permlessAuth } = await setup()
    const err = await $fetch('/api/list-of-100/contacts', {
      method: 'POST',
      body: { name: 'X', relationship: 'friend', faith_status: 'unknown' },
      ...withOrgHeader(permlessAuth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('GET /contacts → 403 when role grants no `list-of-100.read`', async () => {
    const { org, permlessAuth } = await setup()
    const err = await $fetch('/api/list-of-100/contacts', {
      ...withOrgHeader(permlessAuth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('GET /progress → 403 when role grants no `list-of-100.read`', async () => {
    const { org, permlessAuth } = await setup()
    const err = await $fetch('/api/list-of-100/progress', {
      ...withOrgHeader(permlessAuth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('GET /insights → 403 when role grants no `list-of-100.read`', async () => {
    const { org, permlessAuth } = await setup()
    const err = await $fetch('/api/list-of-100/insights', {
      ...withOrgHeader(permlessAuth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('POST /contacts/:id/mark-contacted → 403 when role grants no `list-of-100.write`', async () => {
    const { org, permlessAuth } = await setup()
    const err = await $fetch('/api/list-of-100/contacts/00000000-0000-0000-0000-000000000000/mark-contacted', {
      method: 'POST', ...withOrgHeader(permlessAuth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('POST /contacts/:id/mark-prayed → 403 when role grants no `list-of-100.write`', async () => {
    const { org, permlessAuth } = await setup()
    const err = await $fetch('/api/list-of-100/contacts/00000000-0000-0000-0000-000000000000/mark-prayed', {
      method: 'POST', ...withOrgHeader(permlessAuth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('GET /contacts/:id/history → 403 when role grants no `list-of-100.read`', async () => {
    const { org, permlessAuth } = await setup()
    const err = await $fetch('/api/list-of-100/contacts/00000000-0000-0000-0000-000000000000/history', {
      ...withOrgHeader(permlessAuth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })
})
