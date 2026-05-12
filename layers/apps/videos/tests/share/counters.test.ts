// POST /api/videos/share/:token/play  — bump play_count for public videos
// POST /api/videos/share/:token/view  — bump view_count for public videos,
//                                        skipping owner self-views
//
// Both endpoints go through the SECURITY DEFINER `bump_video_counter` SQL
// function so the no-GUC path can write past the RLS write policy.
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

async function getCounters(sql: ReturnType<typeof getHostAdminDb>, id: string) {
  const rows = await sql<{ view_count: number, play_count: number }[]>`
    SELECT view_count, play_count FROM videos WHERE id = ${id}
  `
  return rows[0]!
}

describe('POST /api/videos/share/:token/play', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupVideosTestData(sql)
  })

  it('public video: anonymous play bumps play_count', async () => {
    const { org, user } = await createVideosOrgWith(sql, ['admin'])
    const video = await createTestVideo(sql, {
      org_id: org.id, user_id: user.id, visibility: 'public', play_count: 0
    })

    const res = await $fetch<{ success: boolean }>(
      `/api/videos/share/${video.share_token}/play`, { method: 'POST' }
    )
    expect(res.success).toBe(true)

    const c = await getCounters(sql, video.id)
    expect(c.play_count).toBe(1)
  })

  it('private video: play endpoint is a no-op (SQL function filters on visibility)', async () => {
    const { org, user } = await createVideosOrgWith(sql, ['admin'])
    const video = await createTestVideo(sql, {
      org_id: org.id, user_id: user.id, visibility: 'private', play_count: 0
    })

    // No 4xx — the function silently filters non-public tokens.
    const res = await $fetch<{ success: boolean }>(
      `/api/videos/share/${video.share_token}/play`, { method: 'POST' }
    )
    expect(res.success).toBe(true)

    const c = await getCounters(sql, video.id)
    expect(c.play_count).toBe(0)
  })

  it('unknown token: success without write (function clauses on token + visibility)', async () => {
    // The handler doesn't 404 on unknown tokens — the SQL function's UPDATE
    // just matches nothing. This pins current behavior so a future tightening
    // (e.g. erroring on unknown tokens) is an intentional change.
    const res = await $fetch<{ success: boolean }>(
      '/api/videos/share/no-such-token/play', { method: 'POST' }
    )
    expect(res.success).toBe(true)
  })
})

describe('POST /api/videos/share/:token/view', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupVideosTestData(sql)
  })

  it('public video: anonymous view bumps view_count; response notes counted=true', async () => {
    const { org, user } = await createVideosOrgWith(sql, ['admin'])
    const video = await createTestVideo(sql, {
      org_id: org.id, user_id: user.id, visibility: 'public', view_count: 0
    })
    const res = await $fetch<{ success: boolean, counted: boolean }>(
      `/api/videos/share/${video.share_token}/view`, { method: 'POST' }
    )
    expect(res.counted).toBe(true)

    const c = await getCounters(sql, video.id)
    expect(c.view_count).toBe(1)
  })

  it('public video: owner self-view does NOT count', async () => {
    const { org, user, auth } = await createVideosOrgWith(sql, ['admin'])
    const video = await createTestVideo(sql, {
      org_id: org.id, user_id: user.id, visibility: 'public', view_count: 0
    })

    const res = await $fetch<{ counted: boolean }>(
      `/api/videos/share/${video.share_token}/view`,
      { method: 'POST', ...withOrgHeader(auth, org.slug) }
    )
    expect(res.counted).toBe(false)

    const c = await getCounters(sql, video.id)
    expect(c.view_count).toBe(0)
  })

  it('public video: non-owner authed user view bumps view_count', async () => {
    const { org, user } = await createVideosOrgWith(sql, ['admin'])
    const other = await addVideosMember(sql, org.id, ['member'])
    const video = await createTestVideo(sql, {
      org_id: org.id, user_id: user.id, visibility: 'public', view_count: 5
    })

    await $fetch(`/api/videos/share/${video.share_token}/view`, {
      method: 'POST', ...withOrgHeader(other.auth, org.slug)
    })

    const c = await getCounters(sql, video.id)
    expect(c.view_count).toBe(6)
  })

  it('private video: owner view returns counted=false and does not bump', async () => {
    const { org, user, auth } = await createVideosOrgWith(sql, ['admin'])
    const video = await createTestVideo(sql, {
      org_id: org.id, user_id: user.id, visibility: 'private', view_count: 3
    })

    const res = await $fetch<{ counted: boolean }>(
      `/api/videos/share/${video.share_token}/view`,
      { method: 'POST', ...withOrgHeader(auth, org.slug) }
    )
    expect(res.counted).toBe(false)

    const c = await getCounters(sql, video.id)
    expect(c.view_count).toBe(3)
  })

  it('private video: anonymous (no GUC) view returns 404 — RLS hides the row', async () => {
    const { org, user } = await createVideosOrgWith(sql, ['admin'])
    const video = await createTestVideo(sql, {
      org_id: org.id, user_id: user.id, visibility: 'private'
    })
    const err = await $fetch(`/api/videos/share/${video.share_token}/view`, { method: 'POST' }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('private video: authed non-owner non-member of org gets 404 (RLS) or 403', async () => {
    const a = await createVideosOrgWith(sql, ['admin'])
    const b = await createVideosOrgWith(sql, ['admin'])
    const video = await createTestVideo(sql, {
      org_id: a.org.id, user_id: a.user.id, visibility: 'private'
    })
    // b.user with b.org as active → RLS hides a.org rows → 404.
    const err = await $fetch(`/api/videos/share/${video.share_token}/view`, {
      method: 'POST', ...withOrgHeader(b.auth, b.org.slug)
    }).catch(e => e)
    expect([403, 404]).toContain(err.statusCode)
  })
})
