// permFor: the code-declared contacts type gets granular slugs; every other
// type key — admin-created customs included — shares the generic crm.records
// set.
import { describe, it, expect } from 'vitest'
import { permFor } from '../../server/utils/crm-perms'

describe('permFor', () => {
  it('resolves contacts to the granular crm.contacts slugs', () => {
    expect(permFor('contacts', 'read')).toBe('crm.contacts.read')
    expect(permFor('contacts', 'create')).toBe('crm.contacts.create')
    expect(permFor('contacts', 'update')).toBe('crm.contacts.update')
    expect(permFor('contacts', 'delete')).toBe('crm.contacts.delete')
    expect(permFor('contacts', 'share')).toBe('crm.contacts.share')
    expect(permFor('contacts', 'view_all')).toBe('crm.contacts.view_all')
  })

  it('resolves every other type key to the generic crm.records slugs', () => {
    expect(permFor('projects', 'read')).toBe('crm.records.read')
    expect(permFor('leads', 'view_all')).toBe('crm.records.view_all')
    expect(permFor('anything_else', 'delete')).toBe('crm.records.delete')
  })
})
