// POST /api/crm/records/:type
// Body: { fields: { <fieldKey>: value } } — `name` arrives as fields.name
// like any other field; multi-value fields take an array or the D.T-style
// { values: [...] } list. Runs the kernel's field-patch pipeline (validation,
// storage routing, activity) and returns the hydrated record detail.
// Permission: <type>.create.

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { applyFieldPatch, permFor, requireRecordType } from '#crm/server'

const Body = z.object({
  fields: z.record(z.string(), z.unknown())
})

export default defineEventHandler(async (event) => {
  const typeKey = getRouterParam(event, 'type')!
  return await withOrgPermission(event, { appId: 'crm' }, permFor(typeKey, 'create'), async (tx, ctx) => {
    await requireRecordType(tx, typeKey)

    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }

    const record = await applyFieldPatch(tx, ctx, typeKey, null, parsed.data.fields)
    return {
      id: record.id,
      typeKey: record.recordType,
      name: record.name,
      status: record.status,
      fields: record.fields,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      createdBy: record.createdBy
    }
  })
})
