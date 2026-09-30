// PUT /api/helpinator/libraries/:id — rename / repoint a library (kind is fixed).
import { withOrgPermission } from '#tenant/server'
import { HelpinatorLibraryInput, helpinatorUpdateLibrary } from '../../../../utils/helpinator-libraries'
import { helpinatorAdminLibrary } from '../../../../utils/helpinator-admin'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'helpinator' }, 'helpinator.manage', async (tx) => {
    const parsed = HelpinatorLibraryInput.safeParse(await readBody(event))
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid library', data: parsed.error.flatten() })
    return helpinatorAdminLibrary(await helpinatorUpdateLibrary(tx, getRouterParam(event, 'id') ?? '', parsed.data))
  })
})
