// PUT /api/inbox/identities/:userId { alias?, signature? }
// Split permission model: changing an ALIAS (routable = attack surface) or
// touching ANOTHER user's identity requires the admin role; a user may edit
// only their OWN signature at the inbox.send tier. `undefined`/absent leaves a
// field untouched; explicit `null` clears it.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({
  alias: z.string().max(64).nullable().optional(),
  signature: z.string().max(20_000).nullable().optional()
})

export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'userId')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx, ctx) => {
    const raw = await readBody(event)
    const parsed = Body.safeParse(raw)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    // `alias` present in the payload (even as null) is an alias change.
    const rawObj = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const changingAlias = Object.prototype.hasOwnProperty.call(rawObj, 'alias')
    const editingOther = userId !== ctx.userId
    const isAdmin = ctx.roles.includes('admin')
    if ((changingAlias || editingOther) && !isAdmin) {
      throw createError({ statusCode: 403, statusMessage: 'Only an admin can change sending aliases or another user’s identity' })
    }

    const patch: { alias?: string | null, signature?: string | null } = {}
    if (changingAlias) {
      patch.alias = parsed.data.alias == null ? null : inboxNormalizeAlias(parsed.data.alias)
    }
    if (parsed.data.signature !== undefined) patch.signature = parsed.data.signature

    try {
      const { row } = await inboxUpsertIdentity(tx, userId, patch)
      return { userId: row.user_id, alias: row.alias, signature: row.signature }
    } catch (err) {
      // A taken alias surfaces as a Postgres unique violation — return a
      // friendly 400 rather than a 500.
      if ((err as { code?: string })?.code === '23505') {
        throw createError({ statusCode: 400, statusMessage: 'That alias is already taken' })
      }
      throw err
    }
  })
})
