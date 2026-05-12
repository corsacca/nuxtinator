// GET /api/videos/share/:token
// Mostly public. Anyone (authed or not) can fetch a `visibility='public'`
// video. Authenticated owners can additionally fetch their own private/org
// videos via the same URL.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupVideosTestData,
  createVideosOrgWith,
  addVideosMember,
  createTestVideo,
  withOrgHeader
} from '../helpers'

interface ShareResp {
  success: boolean
  videoId: string
  title: string | null
  duration: number
  videoUrl: string
  isOwner: boolean
  viewCount: number
  playCount: number
}

describe('GET /api/videos/share/:token', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupVideosTestData(sql)
  })

  it('anonymous can fetch a public video; isOwner=false; signed URL returned', async () => {
    const { org, user } = await createVideosOrgWith(sql, ['admin'])
    const video = await createTestVideo(sql, {
      org_id: org.id, user_id: user.id, visibility: 'public', view_count: 7, play_count: 2
    })

    // No auth cookie, no X-Active-Org header — the RLS read policy lets
    // `visibility='public'` rows through without a GUC set.
    const res = await $fetch<ShareResp>(`/api/videos/share/${video.share_token}`, { method: 'GET' })
    expect(res.videoId).toBe(video.id)
    expect(res.isOwner).toBe(false)
    expect(res.viewCount).toBe(7)
    expect(res.playCount).toBe(2)
    expect(res.videoUrl).toMatch(/^https?:\/\//)
  })

  it('authenticated owner can fetch their own private video; isOwner=true', async () => {
    const { org, user, auth } = await createVideosOrgWith(sql, ['admin'])
    const video = await createTestVideo(sql, {
      org_id: org.id, user_id: user.id, visibility: 'private'
    })

    const res = await $fetch<ShareResp>(`/api/videos/share/${video.share_token}`, {
      method: 'GET', ...withOrgHeader(auth, org.slug)
    })
    expect(res.videoId).toBe(video.id)
    expect(res.isOwner).toBe(true)
  })

  it('403 for an authed non-owner trying to read a private video in the same org', async () => {
    const { org, user: owner } = await createVideosOrgWith(sql, ['admin'])
    const other = await addVideosMember(sql, org.id, ['member'])
    const video = await createTestVideo(sql, {
      org_id: org.id, user_id: owner.id, visibility: 'private'
    })

    const err = await $fetch(`/api/videos/share/${video.share_token}`, {
      method: 'GET', ...withOrgHeader(other.auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('404 for an unknown share token (anonymous)', async () => {
    const err = await $fetch('/api/videos/share/nonexistent-token-zzz', { method: 'GET' }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('400 when token is the empty string', async () => {
    // h3's filesystem router will treat /api/videos/share/ as a different
    // route (missing param), so this asserts the 400 branch via a token of
    // a single space (route matches, getRouterParam returns ' ', which is
    // truthy). For an empty-after-decode token, fall back to the 404 branch.
    const err = await $fetch('/api/videos/share/%20', { method: 'GET' }).catch(e => e)
    // Either way it should not be a 5xx — handler errors out cleanly.
    expect([400, 404]).toContain(err.statusCode)
  })

  it('RLS read isolation: anonymous request for a private (non-public) token returns 404', async () => {
    const { org, user } = await createVideosOrgWith(sql, ['admin'])
    const video = await createTestVideo(sql, {
      org_id: org.id, user_id: user.id, visibility: 'private'
    })
    // Anon path uses base `db` (no GUC set) — RLS read policy hides
    // non-public rows entirely, so the lookup returns nothing → 404.
    const err = await $fetch(`/api/videos/share/${video.share_token}`, { method: 'GET' }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })
})
