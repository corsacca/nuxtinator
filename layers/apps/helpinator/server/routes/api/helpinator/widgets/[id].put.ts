// PUT /api/helpinator/widgets/:id — replace a widget's config. Rebinding it to
// another portfolio ends its open conversations.
import { withOrgPermission } from '#tenant/server'
import { HelpinatorWidgetInput, helpinatorUpdateWidget } from '../../../../utils/helpinator-widgets'
import { helpinatorAdminWidget } from '../../../../utils/helpinator-admin'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'helpinator' }, 'helpinator.manage', async (tx) => {
    const parsed = HelpinatorWidgetInput.safeParse(await readBody(event))
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid widget', data: parsed.error.flatten() })
    return helpinatorAdminWidget(await helpinatorUpdateWidget(tx, getRouterParam(event, 'id') ?? '', parsed.data))
  })
})
