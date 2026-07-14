// MCP tool definitions for the feedback layer.
//
// Read tools use scope `feedback.read`; write tools use `feedback.write`. All
// tools run inside `runInOrgTransaction(event, ...)` from `#tenant/server`,
// which sets the `app.current_org` GUC in multi mode (driven by the
// `X-Active-Org` header on the MCP HTTP request) and is a plain transaction in
// single mode.
//
// Board vocabulary (columns are global to the deployment, ordered by
// position): FEEDBACK INBOX holds untriaged intake — new findings, ideas, and
// feature requests land there. TODO is the approved queue (a human drags a
// card there to green-light it). DOING is in progress, DONE is finished, and
// ARCHIVE holds rejected / deferred / accepted-as-is items.

import { z } from 'zod'
import { sql, type Kysely, type Transaction } from 'kysely'
import { defineMcpTool, mcpError, mcpLog } from '#mcp-layer'
import type { Database as CoreDatabase } from '#core/server/database/schema'
import { runInOrgTransaction } from '#tenant/server'

// The mcp-audit layer types its executor as `Kysely<CoreDatabase>` (core-only
// schema), while feedback-layer transactions carry the augmented Database
// type. Structurally identical at runtime; the cast is a TS-side bridge.
function asAuditExecutor(tx: unknown): Kysely<CoreDatabase> {
  return tx as Kysely<CoreDatabase>
}

function textResult(text: string, structured?: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(structured ? { structuredContent: structured } : {})
  }
}

type Tx = Transaction<CoreDatabase>

// Case-insensitive column lookup by name. Errors list the available names so
// a mistyped column is self-correcting for the calling model.
async function resolveColumn(tx: Tx, name: string) {
  const rows = await tx
    .selectFrom('columns')
    .select(['id', 'name'])
    .orderBy('position', 'asc')
    .execute()
  const match = rows.find(c => c.name.toLowerCase() === name.trim().toLowerCase())
  if (!match) {
    throw createError({
      statusCode: 404,
      statusMessage: `Column "${name}" not found. Available: ${rows.map(c => c.name).join(', ')}`
    })
  }
  return match
}

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
const POST_TYPES = ['task', 'feature', 'bug', 'artifact', 'feedback'] as const

// ─── Read tools ─────────────────────────────────────────────────────────────

export const listProjectsTool = defineMcpTool({
  name: 'feedback_list_projects',
  description: 'List kanban projects (boards) in the active org, plus the global column set with its workflow order. Call this first to get the project_id and column names other feedback tools need.',
  scope: 'feedback.read',
  input: z.object({}).strict(),
  handler: async (_input, ctx) => {
    return await runInOrgTransaction(ctx.event, async (tx) => {
      const projects = await tx
        .selectFrom('projects')
        .select(['id', 'name', 'description', 'created_at'])
        .orderBy('created_at', 'asc')
        .execute()
      const columns = await tx
        .selectFrom('columns')
        .select(['id', 'name', 'position'])
        .orderBy('position', 'asc')
        .execute()
      return textResult(`${projects.length} project(s), ${columns.length} column(s)`, {
        projects: projects.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          created_at: p.created_at.toISOString()
        })),
        columns: columns.map(c => ({ id: c.id, name: c.name, position: c.position }))
      })
    })
  }
})

export const listCardsTool = defineMcpTool({
  name: 'feedback_list_cards',
  description: 'List cards in the active org, optionally filtered to one project and/or one column (by name, e.g. "TODO"). Cards in TODO are approved and waiting to be worked; cards in ARCHIVE were rejected, deferred, or accepted as-is.',
  scope: 'feedback.read',
  input: z.object({
    project_id: z.string().uuid().optional(),
    column: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(200).optional()
  }).strict(),
  handler: async (input, ctx) => {
    return await runInOrgTransaction(ctx.event, async (tx) => {
      let qb = tx
        .selectFrom('cards as k')
        .leftJoin('columns as c', 'c.id', 'k.column_id')
        .select([
          'k.id', 'k.project_id', 'k.title', 'k.post_type', 'k.priority',
          'k.description', 'k.post_meta', 'k.created_at', 'k.updated_at',
          'c.name as column_name', 'c.position as column_position'
        ])
        .orderBy('c.position', 'asc')
        .orderBy('k.last_moved_at', 'desc')
        .limit(input.limit ?? 100)
      if (input.project_id) qb = qb.where('k.project_id', '=', input.project_id)
      if (input.column) {
        const column = await resolveColumn(tx, input.column)
        qb = qb.where('k.column_id', '=', column.id)
      }

      const rows = await qb.execute()
      return textResult(`${rows.length} card(s)`, {
        cards: rows.map(r => ({
          id: r.id,
          project_id: r.project_id,
          title: r.title,
          post_type: r.post_type,
          priority: r.priority,
          column: r.column_name,
          description: r.description,
          post_meta: r.post_meta,
          created_at: r.created_at.toISOString(),
          updated_at: r.updated_at.toISOString()
        }))
      })
    })
  }
})

// ─── Write tools ────────────────────────────────────────────────────────────

export const createCardTool = defineMcpTool({
  name: 'feedback_create_card',
  description: 'Create a card on a project board in the active org. New findings/ideas belong in the default FEEDBACK INBOX column for human triage — only target another column when explicitly asked. Use post_meta for machine data (e.g. repo, branch, file, line, category, dedupe_key).',
  scope: 'feedback.write',
  input: z.object({
    project_id: z.string().uuid(),
    title: z.string().min(1).max(500),
    description: z.string().max(20000).optional(),
    post_type: z.enum(POST_TYPES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    column: z.string().min(1).optional(),
    post_meta: z.record(z.unknown()).optional()
  }).strict(),
  handler: async (input, ctx) => {
    try {
      const result = await runInOrgTransaction(ctx.event, async (tx) => {
        const project = await tx
          .selectFrom('projects')
          .select('id')
          .where('id', '=', input.project_id)
          .executeTakeFirst()
        if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found.' })

        const swimlane = await tx
          .selectFrom('swimlanes')
          .select('id')
          .where('project_id', '=', input.project_id)
          .orderBy('is_default', 'desc')
          .orderBy('position', 'asc')
          .limit(1)
          .executeTakeFirst()
        if (!swimlane) throw createError({ statusCode: 400, statusMessage: 'Project has no swimlanes.' })

        const column = await resolveColumn(tx, input.column ?? 'FEEDBACK INBOX')

        const card = await tx
          .insertInto('cards')
          .values({
            project_id: input.project_id,
            swimlane_id: swimlane.id,
            column_id: column.id,
            title: input.title.trim(),
            post_type: input.post_type ?? 'task',
            description: input.description ?? null,
            priority: input.priority ?? null,
            post_meta: (input.post_meta ?? {}) as Record<string, any>
          })
          .returning(['id', 'title'])
          .executeTakeFirstOrThrow()

        await mcpLog('CREATE', 'cards', card.id, ctx, {
          title: card.title,
          post_type: input.post_type ?? 'task',
          project_id: input.project_id,
          column: column.name
        }, asAuditExecutor(tx))
        return { id: card.id, column: column.name }
      })
      return textResult(`Created card ${result.id} in ${result.column}`, result)
    } catch (err) {
      return mcpError(err)
    }
  }
})

export const moveCardTool = defineMcpTool({
  name: 'feedback_move_card',
  description: 'Move a card to another column by name. Typical agent flow: pick a card from TODO, move it to DOING while working on it, then to DONE when finished. Leave triage moves (into TODO or ARCHIVE) to humans unless instructed.',
  scope: 'feedback.write',
  input: z.object({
    card_id: z.string().uuid(),
    column: z.string().min(1)
  }).strict(),
  handler: async (input, ctx) => {
    try {
      const result = await runInOrgTransaction(ctx.event, async (tx) => {
        const column = await resolveColumn(tx, input.column)
        const updated = await tx
          .updateTable('cards')
          .set({
            column_id: column.id,
            last_moved_at: sql`now()`,
            updated_at: sql`now()`
          })
          .where('id', '=', input.card_id)
          .returning(['id', 'title'])
          .executeTakeFirst()
        if (!updated) throw createError({ statusCode: 404, statusMessage: 'Card not found.' })

        await tx
          .insertInto('card_column_history')
          .values({ card_id: input.card_id, column_id: column.id })
          .execute()

        await mcpLog('UPDATE', 'cards', input.card_id, ctx, {
          moved_to_column: column.name
        }, asAuditExecutor(tx))
        return { id: updated.id, title: updated.title, column: column.name }
      })
      return textResult(`Moved "${result.title}" to ${result.column}`, result)
    } catch (err) {
      return mcpError(err)
    }
  }
})

export const updateCardTool = defineMcpTool({
  name: 'feedback_update_card',
  description: 'Update a card\'s title, description, priority, or post_meta. Use append_description to add a work log (e.g. the commit hash that resolved it) without overwriting the original text. post_meta_merge shallow-merges keys into the existing post_meta.',
  scope: 'feedback.write',
  input: z.object({
    card_id: z.string().uuid(),
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(20000).optional(),
    append_description: z.string().min(1).max(20000).optional(),
    priority: z.enum(PRIORITIES).optional(),
    post_meta_merge: z.record(z.unknown()).optional()
  }).strict().refine(
    v => !(v.description && v.append_description),
    { message: 'Provide either description or append_description, not both.' }
  ),
  handler: async (input, ctx) => {
    try {
      const result = await runInOrgTransaction(ctx.event, async (tx) => {
        const card = await tx
          .selectFrom('cards')
          .select(['id', 'description', 'post_meta'])
          .where('id', '=', input.card_id)
          .executeTakeFirst()
        if (!card) throw createError({ statusCode: 404, statusMessage: 'Card not found.' })

        const updates: Record<string, unknown> = {}
        if (input.title) updates.title = input.title.trim()
        if (input.priority) updates.priority = input.priority
        if (input.description !== undefined) updates.description = input.description
        if (input.append_description) {
          updates.description = card.description
            ? `${card.description}\n\n${input.append_description}`
            : input.append_description
        }
        if (input.post_meta_merge) {
          updates.post_meta = { ...(card.post_meta ?? {}), ...input.post_meta_merge }
        }
        if (Object.keys(updates).length === 0) {
          throw createError({ statusCode: 400, statusMessage: 'No changes provided.' })
        }
        updates.updated_at = sql`now()`

        await tx
          .updateTable('cards')
          .set(updates)
          .where('id', '=', input.card_id)
          .execute()

        await mcpLog('UPDATE', 'cards', input.card_id, ctx, {
          changed: Object.keys(updates).filter(k => k !== 'updated_at')
        }, asAuditExecutor(tx))
        return { id: card.id }
      })
      return textResult(`Updated card ${result.id}`, result)
    } catch (err) {
      return mcpError(err)
    }
  }
})

export const feedbackMcpTools = [
  listProjectsTool,
  listCardsTool,
  createCardTool,
  moveCardTool,
  updateCardTool
]
