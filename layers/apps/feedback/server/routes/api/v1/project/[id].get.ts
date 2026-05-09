/**
 * GET /api/v1/project/:id — public project metadata lookup.
 *
 * Used by <feedback-web-component> so the user can see a human-readable
 * project name before logging in ("sending feedback to: My Project"), not a
 * raw UUID. Returns only {id, name} — no membership or internal state.
 */
import { getRouterParam } from 'h3'
import { withProjectOrgContext } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  return await withProjectOrgContext(event, id, async (tx) => {
    const project = await tx
      .selectFrom('projects')
      .select(['id', 'name'])
      .where('id', '=', id)
      .executeTakeFirst()

    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    return { id: project.id, name: project.name }
  })
})
