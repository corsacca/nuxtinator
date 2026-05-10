// POST /api/messages/conversations/dms
// Body: { userIds: string[] }
// 1:1 → find-or-create (deduped via partial unique index on sorted user-pair).
// Group → always creates fresh.

import { z } from 'zod'
import type { Transaction } from 'kysely'
import type { Database } from '~/server/database/schema'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(20)
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'messages' }, 'messages.write', async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }

    // Final member set: caller + invited userIds, deduped, exclude self.
    const otherIds = Array.from(new Set(parsed.data.userIds.filter(id => id !== ctx.userId)))
    if (otherIds.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'DM must include at least one other user.' })
    }
    const allMemberIds = Array.from(new Set([ctx.userId, ...otherIds]))

    // Validate every recipient is a member of this org.
    const memberships = await tx
      .selectFrom('memberships')
      .select('user_id')
      .where('user_id', 'in', allMemberIds)
      .where('org_id', '=', ctx.orgId!)
      .execute()
    const validUserIds = new Set(memberships.map(m => m.user_id))
    const missing = allMemberIds.filter(id => !validUserIds.has(id))
    if (missing.length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: `Some users are not members of this org: ${missing.join(', ')}`
      })
    }

    if (allMemberIds.length === 2) {
      // 1:1 DM — find-or-create via the sorted-pair partial unique index.
      // Two concurrent callers can both miss the initial SELECT and race
      // into INSERT, so we ON CONFLICT DO NOTHING and re-SELECT when the
      // INSERT no-ops. The partial unique index lives on
      // (dm_pair_lo, dm_pair_hi) WHERE kind='dm' AND dm_pair_lo IS NOT NULL.
      const [a, b] = allMemberIds.sort() as [string, string]

      const existing = await tx
        .selectFrom('messages_conversations')
        .select(['id'])
        .where('kind', '=', 'dm')
        .where('dm_pair_lo', '=', a)
        .where('dm_pair_hi', '=', b)
        .executeTakeFirst()

      if (existing) {
        return await loadDm(tx, existing.id)
      }

      const created = await tx
        .insertInto('messages_conversations')
        .values({
          kind: 'dm',
          name: null,
          description: null,
          created_by: ctx.userId,
          dm_pair_lo: a,
          dm_pair_hi: b
        })
        .onConflict(oc => oc.columns(['dm_pair_lo', 'dm_pair_hi']).doNothing())
        .returning('id')
        .executeTakeFirst()

      if (!created) {
        // Lost the race — another tx already inserted the row. Re-SELECT.
        const winner = await tx
          .selectFrom('messages_conversations')
          .select(['id'])
          .where('kind', '=', 'dm')
          .where('dm_pair_lo', '=', a)
          .where('dm_pair_hi', '=', b)
          .executeTakeFirstOrThrow()
        return await loadDm(tx, winner.id)
      }

      await tx
        .insertInto('messages_conversation_members')
        .values([
          { conversation_id: created.id, user_id: a, role: 'member' },
          { conversation_id: created.id, user_id: b, role: 'member' }
        ])
        .execute()

      return await loadDm(tx, created.id)
    }

    // Group DM (3+ members) — always create fresh.
    const created = await tx
      .insertInto('messages_conversations')
      .values({
        kind: 'dm',
        name: null,
        description: null,
        created_by: ctx.userId,
        dm_pair_lo: null,
        dm_pair_hi: null
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await tx
      .insertInto('messages_conversation_members')
      .values(allMemberIds.map(uid => ({
        conversation_id: created.id,
        user_id: uid,
        role: 'member'
      })))
      .execute()

    return await loadDm(tx, created.id)
  })
})

async function loadDm(
  tx: Transaction<Database>,
  conversationId: string
): Promise<{ id: string, kind: 'dm', members: Array<{ id: string, display_name: string, avatar: string }> }> {
  const members = await tx
    .selectFrom('messages_conversation_members as m')
    .innerJoin('users', 'users.id', 'm.user_id')
    .select(['users.id', 'users.display_name', 'users.avatar'])
    .where('m.conversation_id', '=', conversationId)
    .execute()
  return {
    id: conversationId,
    kind: 'dm',
    members: members.map(u => ({ id: u.id, display_name: u.display_name, avatar: u.avatar }))
  }
}
