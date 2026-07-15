// applyFieldPatch through the record routes: jsonb set/null-delete, entry
// add/remove/force, user_refs, required-on-create, unknown fields, option
// validation, and the per-field activity rows.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupCrmTestData,
  createCrmOrgWith,
  addCrmMember,
  withOrgHeader
} from '../helpers'

interface RecordDetail {
  id: string
  typeKey: string
  name: string
  status: string | null
  fields: Record<string, unknown>
}

const sql = getHostAdminDb()
afterEach(async () => { await cleanupCrmTestData(sql) })

async function createContact(
  opts: ReturnType<typeof withOrgHeader>,
  fields: Record<string, unknown>
): Promise<RecordDetail> {
  return await $fetch<RecordDetail>('/api/crm/records/contacts', {
    method: 'POST',
    body: { fields },
    ...opts
  })
}

describe('POST /api/crm/records/contacts (create pipeline)', () => {
  it('creates with promoted + jsonb fields and applies the status default', async () => {
    const { org, auth } = await createCrmOrgWith(sql, ['admin'])
    const opts = withOrgHeader(auth, org.slug)
    const rec = await createContact(opts, { name: 'test-crm Ada', nickname: 'Ada' })
    expect(rec.name).toBe('test-crm Ada')
    // The manifest declares default: 'new' on the status field.
    expect(rec.status).toBe('new')
    expect(rec.fields.nickname).toBe('Ada')
  })

  it('400s when the required name is missing or empty', async () => {
    const { org, auth } = await createCrmOrgWith(sql, ['admin'])
    const opts = withOrgHeader(auth, org.slug)
    const missing = await createContact(opts, {}).catch(e => e)
    expect(missing.statusCode).toBe(400)
    const empty = await createContact(opts, { name: '  ' }).catch(e => e)
    expect(empty.statusCode).toBe(400)
  })

  it('400s on unknown fields', async () => {
    const { org, auth } = await createCrmOrgWith(sql, ['admin'])
    const opts = withOrgHeader(auth, org.slug)
    const err = await createContact(opts, { name: 'test-crm X', bogus: 1 }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('400s on key_select values outside the option vocabulary', async () => {
    const { org, auth } = await createCrmOrgWith(sql, ['admin'])
    const opts = withOrgHeader(auth, org.slug)
    const err = await createContact(opts, { name: 'test-crm X', status: 'bogus' }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })
})

describe('PATCH /api/crm/records/contacts/:id (jsonb)', () => {
  it('sets a jsonb key and removes it on null', async () => {
    const { org, auth } = await createCrmOrgWith(sql, ['admin'])
    const opts = withOrgHeader(auth, org.slug)
    const rec = await createContact(opts, { name: 'test-crm Jane', nickname: 'Janey' })

    const cleared = await $fetch<RecordDetail>(`/api/crm/records/contacts/${rec.id}`, {
      method: 'PATCH',
      body: { fields: { nickname: null } },
      ...opts
    })
    expect(cleared.fields.nickname).toBeNull()

    // null means delete-the-key, not store-a-null.
    const rows = await sql`SELECT data FROM crm_records WHERE id = ${rec.id}`
    expect(Object.keys(rows[0]!.data as Record<string, unknown>)).not.toContain('nickname')
  })
})

describe('PATCH multi-value fields (entries)', () => {
  it('adds, removes, and force-replaces entry values', async () => {
    const { org, auth } = await createCrmOrgWith(sql, ['admin'])
    const opts = withOrgHeader(auth, org.slug)
    const rec = await createContact(opts, { name: 'test-crm Multi' })

    // Add two values via the D.T-style list.
    let updated = await $fetch<RecordDetail>(`/api/crm/records/contacts/${rec.id}`, {
      method: 'PATCH',
      body: { fields: { languages: { values: [{ value: 'en' }, { value: 'es' }] } } },
      ...opts
    })
    expect(updated.fields.languages).toEqual(['en', 'es'])

    // Remove one.
    updated = await $fetch<RecordDetail>(`/api/crm/records/contacts/${rec.id}`, {
      method: 'PATCH',
      body: { fields: { languages: { values: [{ value: 'en', delete: true }] } } },
      ...opts
    })
    expect(updated.fields.languages).toEqual(['es'])

    // A plain array force-replaces the whole list.
    updated = await $fetch<RecordDetail>(`/api/crm/records/contacts/${rec.id}`, {
      method: 'PATCH',
      body: { fields: { languages: ['fr'] } },
      ...opts
    })
    expect(updated.fields.languages).toEqual(['fr'])
  })

  it('validates multi_select values against the option vocabulary', async () => {
    const { org, auth } = await createCrmOrgWith(sql, ['admin'])
    const opts = withOrgHeader(auth, org.slug)
    const rec = await createContact(opts, { name: 'test-crm Opt' })
    const err = await $fetch(`/api/crm/records/contacts/${rec.id}`, {
      method: 'PATCH',
      body: { fields: { languages: ['klingon'] } },
      ...opts
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })
})

describe('PATCH user_select fields (user_refs, multiple)', () => {
  it('assigns multiple users and removes one', async () => {
    const { org, auth } = await createCrmOrgWith(sql, ['admin'])
    const m1 = await addCrmMember(sql, org.id, ['member'])
    const m2 = await addCrmMember(sql, org.id, ['member'])
    const opts = withOrgHeader(auth, org.slug)
    const rec = await createContact(opts, { name: 'test-crm Assigned' })

    let updated = await $fetch<RecordDetail>(`/api/crm/records/contacts/${rec.id}`, {
      method: 'PATCH',
      body: { fields: { assigned_to: [m1.user.id, m2.user.id] } },
      ...opts
    })
    expect((updated.fields.assigned_to as string[]).sort()).toEqual([m1.user.id, m2.user.id].sort())

    updated = await $fetch<RecordDetail>(`/api/crm/records/contacts/${rec.id}`, {
      method: 'PATCH',
      body: { fields: { assigned_to: { values: [{ value: m1.user.id, delete: true }] } } },
      ...opts
    })
    expect(updated.fields.assigned_to).toEqual([m2.user.id])
  })

  it('400s on user ids that do not exist', async () => {
    const { org, auth } = await createCrmOrgWith(sql, ['admin'])
    const opts = withOrgHeader(auth, org.slug)
    const rec = await createContact(opts, { name: 'test-crm BadRef' })
    const err = await $fetch(`/api/crm/records/contacts/${rec.id}`, {
      method: 'PATCH',
      body: { fields: { assigned_to: ['00000000-0000-4000-8000-000000000000'] } },
      ...opts
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })
})

describe('activity rows', () => {
  it('writes created on create and field_changed with full old/new on update', async () => {
    const { org, auth } = await createCrmOrgWith(sql, ['admin'])
    const opts = withOrgHeader(auth, org.slug)
    const rec = await createContact(opts, { name: 'test-crm Audit', nickname: 'Before' })

    await $fetch(`/api/crm/records/contacts/${rec.id}`, {
      method: 'PATCH',
      body: { fields: { nickname: 'After' } },
      ...opts
    })

    const rows = await sql`
      SELECT action, field_key, old_value, new_value
      FROM crm_record_activity WHERE record_id = ${rec.id}
      ORDER BY created_at ASC
    `
    expect(rows.find(r => r.action === 'created')).toBeDefined()
    const change = rows.find(r => r.action === 'field_changed' && r.field_key === 'nickname')
    expect(change).toBeDefined()
    expect(change!.old_value).toBe('Before')
    expect(change!.new_value).toBe('After')
  })

  it('writes no field_changed row when the value did not change', async () => {
    const { org, auth } = await createCrmOrgWith(sql, ['admin'])
    const opts = withOrgHeader(auth, org.slug)
    const rec = await createContact(opts, { name: 'test-crm NoChange', nickname: 'Same' })

    await $fetch(`/api/crm/records/contacts/${rec.id}`, {
      method: 'PATCH',
      body: { fields: { nickname: 'Same' } },
      ...opts
    })

    const rows = await sql`
      SELECT id FROM crm_record_activity
      WHERE record_id = ${rec.id} AND action = 'field_changed'
    `
    expect(rows).toHaveLength(0)
  })
})
