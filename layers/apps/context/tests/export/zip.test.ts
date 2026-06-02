// Full-portfolio zip export via HTTP. Fetches the binary body, parses with
// jszip, asserts every section + README is present and the seeded content
// landed in the right file.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import JSZip from 'jszip'
import {
  getHostAdminDb,
  cleanupContextTestData,
  createContextOrgWith,
  createTestPortfolio,
  withOrgHeader
} from '../helpers'
import { CONTEXT_SECTIONS } from '../../server/utils/section-catalog'

describe('GET /api/context/portfolios/:slug/export (zip)', () => {
  const sql = getHostAdminDb()
  afterEach(async () => { await cleanupContextTestData(sql) })

  it('packs every section + README; seeded content lands in the right file', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Zip Export', created_by: user.id })
    await $fetch(`/api/context/portfolios/${p.slug}/sections/identity`, {
      method: 'PUT', body: { content: 'We make widgets.' }, ...withOrgHeader(auth, org.slug)
    })

    const buf = await $fetch<ArrayBuffer>(
      `/api/context/portfolios/${p.slug}/export`,
      { responseType: 'arrayBuffer', ...withOrgHeader(auth, org.slug) }
    )
    const zip = await JSZip.loadAsync(Buffer.from(buf))
    expect(zip.file('README.md')).toBeTruthy()
    expect(zip.file('identity.md')).toBeTruthy()

    const identity = await zip.file('identity.md')!.async('string')
    expect(identity).toContain('We make widgets.')

    // Every built-in section gets its own file.
    for (const def of CONTEXT_SECTIONS) {
      expect(zip.file(`${def.key}.md`)).toBeTruthy()
    }
  })
})
