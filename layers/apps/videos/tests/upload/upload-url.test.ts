// POST /api/videos/upload-url
// Generates pre-signed S3 PUT URLs for direct browser upload. Validates
// fileName + contentType against allow-lists; returns videoId, videoKey,
// videoUploadUrl, and optionally a thumbnail upload URL/key.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupVideosTestData,
  createVideosOrgWith,
  withOrgHeader
} from '../helpers'

interface UploadUrlResp {
  success: boolean
  videoId: string
  videoKey: string
  videoUploadUrl: string
  thumbnailKey: string | null
  thumbnailUploadUrl: string | null
}

describe('POST /api/videos/upload-url', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupVideosTestData(sql)
  })

  it('returns 401 when unauthenticated', async () => {
    const err = await $fetch('/api/videos/upload-url', {
      method: 'POST',
      body: { fileName: 'test.webm', contentType: 'video/webm' }
    }).catch(e => e)
    expect(err.statusCode).toBe(401)
  })

  it('happy path: returns a videoId, videoKey, and presigned URL', async () => {
    const { org, auth } = await createVideosOrgWith(sql, ['admin'])
    const res = await $fetch<UploadUrlResp>(
      '/api/videos/upload-url',
      { method: 'POST', body: { fileName: 'clip.webm', contentType: 'video/webm' }, ...withOrgHeader(auth, org.slug) }
    )
    expect(res.success).toBe(true)
    expect(res.videoId).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.videoKey).toBe(`${res.videoId}.webm`)
    // Presigned URL points at the configured S3 endpoint and includes the key.
    expect(res.videoUploadUrl).toMatch(/^https?:\/\//)
    expect(res.videoUploadUrl).toContain(res.videoKey)
    // No thumbnail requested.
    expect(res.thumbnailKey).toBeNull()
    expect(res.thumbnailUploadUrl).toBeNull()
  })

  it('returns paired thumbnail upload URL when withThumbnail is true', async () => {
    const { org, auth } = await createVideosOrgWith(sql, ['admin'])
    const res = await $fetch<UploadUrlResp>(
      '/api/videos/upload-url',
      {
        method: 'POST',
        body: { fileName: 'clip.mp4', contentType: 'video/mp4', withThumbnail: true },
        ...withOrgHeader(auth, org.slug)
      }
    )
    expect(res.videoKey).toBe(`${res.videoId}.mp4`)
    expect(res.thumbnailKey).toBe(`${res.videoId}-thumb.jpg`)
    expect(res.thumbnailUploadUrl).toContain('-thumb.jpg')
  })

  it('400 when fileName is missing', async () => {
    const { org, auth } = await createVideosOrgWith(sql, ['admin'])
    const err = await $fetch('/api/videos/upload-url', {
      method: 'POST', body: { contentType: 'video/webm' }, ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('400 when extension is not in the allow-list', async () => {
    const { org, auth } = await createVideosOrgWith(sql, ['admin'])
    const err = await $fetch('/api/videos/upload-url', {
      method: 'POST', body: { fileName: 'clip.exe', contentType: 'video/webm' }, ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('400 when contentType is not in the allow-list', async () => {
    const { org, auth } = await createVideosOrgWith(sql, ['admin'])
    const err = await $fetch('/api/videos/upload-url', {
      method: 'POST',
      body: { fileName: 'clip.webm', contentType: 'application/x-evil' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('400 when fileName exceeds the length cap', async () => {
    const { org, auth } = await createVideosOrgWith(sql, ['admin'])
    const longName = 'a'.repeat(260) + '.webm'
    const err = await $fetch('/api/videos/upload-url', {
      method: 'POST',
      body: { fileName: longName, contentType: 'video/webm' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('410 when the videos app is disabled for the active org', async () => {
    const { org, auth } = await createVideosOrgWith(sql, ['admin'])
    // Override the catalog default (enabled) by inserting a per-org disable row.
    await sql`
      INSERT INTO org_apps (org_id, app_id, enabled, source)
      VALUES (${org.id}, 'videos', false, 'org_admin')
      ON CONFLICT (org_id, app_id) DO UPDATE SET enabled = excluded.enabled
    `
    const err = await $fetch('/api/videos/upload-url', {
      method: 'POST',
      body: { fileName: 'clip.webm', contentType: 'video/webm' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(410)
  })
})
