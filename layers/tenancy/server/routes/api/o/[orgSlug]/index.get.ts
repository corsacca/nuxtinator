import { withOrgContext } from '#tenant/server'

// Org details for the active org. Counts come from inside the txn so they're
// RLS-scoped to the active org automatically.
export default defineEventHandler(async (event) => {
  return await withOrgContext(event, async (tx, ctx) => {
    const memberCountRow = await tx
      .selectFrom('memberships')
      .select(eb => eb.fn.count<string>('id').as('count'))
      .where('org_id', '=', ctx.orgId)
      .executeTakeFirst()

    return {
      id: ctx.orgId,
      slug: ctx.orgSlug,
      name: ctx.orgName,
      suspended: false,
      member_count: Number(memberCountRow?.count ?? 0),
      perms: [...ctx.perms]
    }
  })
})
