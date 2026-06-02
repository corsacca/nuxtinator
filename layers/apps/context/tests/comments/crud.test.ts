// Comments + replies via HTTP. Anchor offsets persist; `anchor_stale`
// flips true when the underlying section content changes. Resolve sets
// is_resolved=true and is filtered out of the default list. Reply delete
// affects only the reply.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupContextTestData,
  createContextOrgWith,
  createTestPortfolio,
  withOrgHeader
} from '../helpers'

describe('comments + replies via HTTP', () => {
  const sql = getHostAdminDb()
  afterEach(async () => { await cleanupContextTestData(sql) })

  it('persists anchor offsets and rehydrates them on GET', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Anchor', created_by: user.id })
    await $fetch(`/api/context/portfolios/${p.slug}/sections/identity`, {
      method: 'PUT', body: { content: 'The team values clarity.' }, ...withOrgHeader(auth, org.slug)
    })

    const comment = await $fetch<{ id: string }>(
      `/api/context/portfolios/${p.slug}/sections/identity/comments`,
      {
        method: 'POST',
        body: { content: 'Nice line', quoted_text: 'team', anchor_start: 4, anchor_end: 8 },
        ...withOrgHeader(auth, org.slug)
      }
    )

    const list = await $fetch<{ comments: Array<{ id: string, anchor_start: number, anchor_end: number, anchor_stale: boolean }> }>(
      `/api/context/portfolios/${p.slug}/sections/identity/comments`,
      { ...withOrgHeader(auth, org.slug) }
    )
    const c = list.comments.find(c => c.id === comment.id)
    expect(c?.anchor_start).toBe(4)
    expect(c?.anchor_end).toBe(8)
    expect(c?.anchor_stale).toBe(false)
  })

  it('flags anchor_stale=true when content changes underneath', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Stale', created_by: user.id })
    await $fetch(`/api/context/portfolios/${p.slug}/sections/identity`, {
      method: 'PUT', body: { content: 'The team values clarity.' }, ...withOrgHeader(auth, org.slug)
    })
    await $fetch(`/api/context/portfolios/${p.slug}/sections/identity/comments`, {
      method: 'POST',
      body: { content: 'A', quoted_text: 'team', anchor_start: 4, anchor_end: 8 },
      ...withOrgHeader(auth, org.slug)
    })
    // Rewrite the section so the slice no longer matches the anchor.
    await $fetch(`/api/context/portfolios/${p.slug}/sections/identity`, {
      method: 'PUT', body: { content: 'The crew values clarity.' }, ...withOrgHeader(auth, org.slug)
    })

    const list = await $fetch<{ comments: Array<{ anchor_stale: boolean }> }>(
      `/api/context/portfolios/${p.slug}/sections/identity/comments`,
      { ...withOrgHeader(auth, org.slug) }
    )
    expect(list.comments[0]?.anchor_stale).toBe(true)
  })

  it('resolve flips is_resolved and removes the comment from the default list', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Resolve', created_by: user.id })
    await $fetch(`/api/context/portfolios/${p.slug}/sections/identity`, {
      method: 'PUT', body: { content: 'hello world' }, ...withOrgHeader(auth, org.slug)
    })
    const c = await $fetch<{ id: string }>(
      `/api/context/portfolios/${p.slug}/sections/identity/comments`,
      {
        method: 'POST',
        body: { content: 'todo', quoted_text: 'hello', anchor_start: 0, anchor_end: 5 },
        ...withOrgHeader(auth, org.slug)
      }
    )
    await $fetch(`/api/context/portfolios/${p.slug}/sections/identity/comments/${c.id}/resolve`, {
      method: 'POST', ...withOrgHeader(auth, org.slug)
    })

    const list = await $fetch<{ comments: Array<{ id: string }> }>(
      `/api/context/portfolios/${p.slug}/sections/identity/comments`,
      { ...withOrgHeader(auth, org.slug) }
    )
    expect(list.comments.find(x => x.id === c.id)).toBeUndefined()

    const incl = await $fetch<{ comments: Array<{ id: string, is_resolved: boolean }> }>(
      `/api/context/portfolios/${p.slug}/sections/identity/comments?include_resolved=true`,
      { ...withOrgHeader(auth, org.slug) }
    )
    expect(incl.comments.find(x => x.id === c.id)?.is_resolved).toBe(true)
  })

  it('reply delete leaves the parent comment intact', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'ReplyDel', created_by: user.id })
    await $fetch(`/api/context/portfolios/${p.slug}/sections/identity`, {
      method: 'PUT', body: { content: 'hello world' }, ...withOrgHeader(auth, org.slug)
    })
    const parent = await $fetch<{ id: string }>(
      `/api/context/portfolios/${p.slug}/sections/identity/comments`,
      {
        method: 'POST',
        body: { content: 'top', quoted_text: 'hello', anchor_start: 0, anchor_end: 5 },
        ...withOrgHeader(auth, org.slug)
      }
    )
    const reply = await $fetch<{ id: string }>(
      `/api/context/portfolios/${p.slug}/sections/identity/comments/${parent.id}/replies`,
      { method: 'POST', body: { content: 'agreed' }, ...withOrgHeader(auth, org.slug) }
    )

    await $fetch(
      `/api/context/portfolios/${p.slug}/sections/identity/comments/${parent.id}/replies/${reply.id}`,
      { method: 'DELETE', ...withOrgHeader(auth, org.slug) }
    )

    const list = await $fetch<{ comments: Array<{ id: string, replies: Array<{ id: string }> }> }>(
      `/api/context/portfolios/${p.slug}/sections/identity/comments`,
      { ...withOrgHeader(auth, org.slug) }
    )
    const top = list.comments.find(c => c.id === parent.id)
    expect(top).toBeDefined()
    expect(top!.replies.length).toBe(0)
  })
})
