// MCP tool definitions for the files layer.
//
// Read tools use scope `files.read`; write tools use `files.write`. All tools
// run inside `runInOrgTransaction(event, ...)` from `#tenant/server`, which
// sets the `app.current_org` GUC in multi mode (driven by the `X-Active-Org`
// header on the MCP HTTP request) and is a plain transaction in single mode.
//
// Only documents are exposed for create/update — binary upload over MCP is
// out of scope.

import { z } from 'zod'
import { sql, type Kysely } from 'kysely'
import { defineMcpTool, mcpError, mcpLog, type McpToolContext } from '#mcp-layer'
import type { Database as CoreDatabase } from '#core/server/database/schema'
import { runInOrgTransaction } from '#tenant/server'
import { loadItem, saveDocContent, MAX_DOC_BYTES } from '../utils/file-helpers'

// The mcp-audit layer types its executor as `Kysely<CoreDatabase>` (core-only
// schema), while files-layer transactions carry the augmented Database type.
// Structurally identical at runtime; the cast is a TS-side bridge.
function asAuditExecutor(tx: unknown): Kysely<CoreDatabase> {
  return tx as Kysely<CoreDatabase>
}

function textResult(text: string, structured?: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(structured ? { structuredContent: structured } : {})
  }
}

// ─── Read tools ─────────────────────────────────────────────────────────────

export const listFilesTool = defineMcpTool({
  name: 'files_list',
  description: 'List documents and uploaded files in the active org, newest first.',
  scope: 'files.read',
  input: z.object({
    kind: z.enum(['doc', 'file', 'site']).optional(),
    limit: z.number().int().min(1).max(100).optional()
  }).strict(),
  handler: async (input, ctx) => {
    const limit = input.limit ?? 50
    return await runInOrgTransaction(ctx.event, async (tx) => {
      let qb = tx
        .selectFrom('files_items as f')
        .leftJoin('users as u', 'u.id', 'f.created_by')
        .select([
          'f.id', 'f.kind', 'f.title', 'f.filename', 'f.mime', 'f.tags',
          'f.created_at', 'u.display_name as created_by_name'
        ])
        .where('f.deleted_at', 'is', null)
        .orderBy('f.created_at', 'desc')
        .limit(limit)
      if (input.kind) qb = qb.where('f.kind', '=', input.kind)

      const rows = await qb.execute()
      return textResult(`${rows.length} item(s)`, {
        items: rows.map(r => ({
          id: r.id,
          kind: r.kind,
          title: r.title,
          filename: r.filename,
          mime: r.mime,
          tags: r.tags,
          created_by_name: r.created_by_name,
          created_at: (r.created_at as Date).toISOString()
        }))
      })
    })
  }
})

export const readDocTool = defineMcpTool({
  name: 'files_read_doc',
  description: 'Read a single document, returning its markdown body.',
  scope: 'files.read',
  input: z.object({ id: z.string().uuid() }).strict(),
  handler: async (input, ctx) => {
    return await runInOrgTransaction(ctx.event, async (tx) => {
      const item = await loadItem(tx, input.id)
      if (!item) throw createError({ statusCode: 404, statusMessage: 'Document not found.' })
      if (item.kind !== 'doc') {
        throw createError({ statusCode: 400, statusMessage: 'Not a document.' })
      }
      return textResult(`Document "${item.title}"`, {
        id: item.id,
        title: item.title,
        body_md: item.body_md ?? '',
        tags: item.tags
      })
    })
  }
})

// ─── Write tools ────────────────────────────────────────────────────────────

export const createDocTool = defineMcpTool({
  name: 'files_create_doc',
  description: 'Create a new markdown document in the active org.',
  scope: 'files.write',
  input: z.object({
    title: z.string().min(1).max(500),
    body_md: z.string().max(MAX_DOC_BYTES).optional(),
    tags: z.array(z.string().min(1).max(64)).max(50).optional()
  }).strict(),
  handler: async (input, ctx) => {
    try {
      const result = await runInOrgTransaction(ctx.event, async (tx) => {
        const bodyMd = input.body_md ?? ''
        // z.string().max() caps UTF-16 units, not bytes — enforce the real
        // byte cap here so MCP matches the REST create + saveDocContent paths.
        if (Buffer.byteLength(bodyMd, 'utf8') > MAX_DOC_BYTES) {
          throw createError({ statusCode: 413, statusMessage: 'Document content exceeds 100KB limit.' })
        }
        const tags = [...new Set((input.tags ?? []).map(t => t.trim()).filter(Boolean))]
        const item = await tx
          .insertInto('files_items')
          .values({
            kind: 'doc',
            title: input.title.trim(),
            body_md: bodyMd,
            tags,
            created_by: ctx.auth.userId,
            last_edited_by: ctx.auth.userId,
            last_edited_at: sql<Date>`now()`
          })
          .returning(['id', 'created_at'])
          .executeTakeFirstOrThrow()

        await tx.insertInto('files_versions')
          .values({ item_id: item.id, title: input.title.trim(), content: bodyMd, edited_by: ctx.auth.userId })
          .execute()

        await mcpLog('CREATE', 'files_items', item.id, ctx, { kind: 'doc' }, asAuditExecutor(tx))
        return { id: item.id }
      })
      return textResult(`Created document ${result.id}`, result)
    } catch (err) {
      return mcpError(err)
    }
  }
})

export const updateDocTool = defineMcpTool({
  name: 'files_update_doc',
  description: 'Update a document\'s title and/or markdown body. Creates a new version snapshot.',
  scope: 'files.write',
  input: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).max(500).optional(),
    body_md: z.string().max(MAX_DOC_BYTES).optional()
  }).strict(),
  handler: async (input, ctx) => {
    try {
      const result = await runInOrgTransaction(ctx.event, async (tx) => {
        const item = await loadItem(tx, input.id)
        if (!item) throw createError({ statusCode: 404, statusMessage: 'Document not found.' })
        if (item.kind !== 'doc') {
          throw createError({ statusCode: 400, statusMessage: 'Not a document.' })
        }
        const { versionId } = await saveDocContent(tx, input.id, {
          title: input.title?.trim() ?? item.title,
          body_md: input.body_md ?? item.body_md ?? ''
        }, ctx.auth.userId)

        await mcpLog('UPDATE', 'files_items', input.id, ctx, { version_id: versionId }, asAuditExecutor(tx))
        return { id: input.id, version_id: versionId }
      })
      return textResult(`Updated document ${result.id}`, result)
    } catch (err) {
      return mcpError(err)
    }
  }
})

export const filesMcpTools = [
  listFilesTool,
  readDocTool,
  createDocTool,
  updateDocTool
]
