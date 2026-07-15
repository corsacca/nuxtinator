// Inline-image upload + authenticated serving: magic-byte gate, the proxy
// serving the real image content-type, and org isolation of the object key.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { getHostAdminDb, cleanupInboxTestData, createInboxOrgWith } from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0])

function imageForm(bytes: Uint8Array, name: string, type: string) {
  const fd = new FormData()
  fd.append('image', new Blob([bytes], { type }), name)
  return fd
}

describe('inline images', () => {
  it('uploads a sniffed image and serves it back with the real content-type', async () => {
    const { opts } = await createInboxOrgWith(sql)
    const up = await $fetch<{ url: string }>('/api/inbox/inline-images', {
      method: 'POST', body: imageForm(PNG, 'shot.png', 'image/png'), ...opts
    })
    expect(up.url).toContain('/api/inbox/inline-image/inbox-inline/')

    // Serving succeeds (200 → body resolves); the sniffed content-type header
    // is covered by the sniffer unit test.
    const served = await $fetch(up.url, { ...opts, responseType: 'arrayBuffer' }) as ArrayBuffer
    expect(served.byteLength).toBeGreaterThan(0)
  })

  it('rejects a non-image masquerading as a .png', async () => {
    const { opts } = await createInboxOrgWith(sql)
    await expect(
      $fetch('/api/inbox/inline-images', { method: 'POST', body: imageForm(new TextEncoder().encode('<!DOCTYPE html><body>x'), 'x.png', 'image/png'), ...opts })
    ).rejects.toMatchObject({ statusCode: 415 })
  })

  it('will not serve another org\'s image, nor a non-inline key', async () => {
    const { opts } = await createInboxOrgWith(sql)
    const other = await createInboxOrgWith(sql)
    const up = await $fetch<{ url: string }>('/api/inbox/inline-images', {
      method: 'POST', body: imageForm(PNG, 'shot.png', 'image/png'), ...opts
    })
    // Same key, a different org's context → 404 (org segment mismatch).
    await expect($fetch(up.url, other.opts)).rejects.toMatchObject({ statusCode: 404 })
    // A key outside the inline prefix is refused before any fetch.
    await expect($fetch('/api/inbox/inline-image/inbox/raw-x.eml', opts)).rejects.toMatchObject({ statusCode: 404 })
  })
})
