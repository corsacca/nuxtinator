// Icon upload via multipart/form-data. The handler validates content-type
// and size, uploads to S3, then patches the portfolio row's `icon_url`. We
// skip the test when no S3 bucket is configured (S3_BUCKET_NAME unset) —
// without a writable bucket the call would 5xx rather than return a useful
// signal. The validation paths (400/413/415) are exercised regardless.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupContextTestData,
  createContextOrgWith,
  createTestPortfolio,
  withOrgHeader
} from '../helpers'

// 1x1 PNG.
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4'
  + '890000000d49444154789c63f8cf000000010100000118c4f3a90000000049454e44ae426082',
  'hex'
)

function makeForm(file: Buffer, filename: string, type: string): FormData {
  const fd = new FormData()
  const blob = new Blob([new Uint8Array(file)], { type })
  fd.append('file', blob, filename)
  return fd
}

// Skip the happy-path upload when no public base URL is configured —
// `uploadToS3` calls `getPublicUrl()` which throws if `S3_PUBLIC_BASE_URL`
// is unset, masking what would otherwise be a clean 200. Validation paths
// (400/415) still run regardless.
const SKIP_S3 = !process.env.S3_BUCKET_NAME || !process.env.S3_PUBLIC_BASE_URL

describe('POST /api/context/portfolios/:slug/icon', () => {
  const sql = getHostAdminDb()
  afterEach(async () => { await cleanupContextTestData(sql) })

  it.skipIf(SKIP_S3)('uploads a PNG and stores the resulting URL on the portfolio row', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Icon Test', created_by: user.id })

    const res = await $fetch<{ icon_url: string | null }>(
      `/api/context/portfolios/${p.slug}/icon`,
      {
        method: 'POST',
        body: makeForm(TINY_PNG, 'icon.png', 'image/png'),
        ...withOrgHeader(auth, org.slug)
      }
    )
    expect(res.icon_url).toBeTruthy()

    const rows = await sql<{ icon_url: string | null }[]>`
      SELECT icon_url FROM context_portfolios WHERE id = ${p.id}
    `
    expect(rows[0]!.icon_url).toBe(res.icon_url)
  })

  it('rejects non-image content-type with 415', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Icon Test', created_by: user.id })

    const err = await $fetch(`/api/context/portfolios/${p.slug}/icon`, {
      method: 'POST',
      body: makeForm(Buffer.from('plain text'), 'file.txt', 'text/plain'),
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(415)
  })

  it('rejects body without a "file" field with 400', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Icon Test', created_by: user.id })
    const fd = new FormData()
    fd.append('not_file', new Blob([new Uint8Array(TINY_PNG)], { type: 'image/png' }), 'icon.png')

    const err = await $fetch(`/api/context/portfolios/${p.slug}/icon`, {
      method: 'POST',
      body: fd,
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })
})
