// MCP tool definitions for the context layer.
//
// Read tools use scope `context.read`; write tools use `context.write`.
// All tools run inside `runInOrgTransaction(event, ...)` from `#tenant/server`,
// which sets the active-org GUC in multi mode (the `X-Active-Org` header on
// the MCP HTTP request) and is a plain transaction in single mode.
//
// `read_organization` is the source-API name — it returns the whole portfolio
// (sections + content) for a given portfolio_id. The name is preserved for
// backward compat with users' MCP clients even though the scope is now per
// portfolio rather than per organization.
//
// `update_section` and `bulk_update_sections` support optimistic locking via
// an optional `last_edited_at` ISO timestamp. If the section has been edited
// since the caller's read, the update is rejected with `status: 'conflict'`.

import { z } from 'zod'
import { sql, type Kysely } from 'kysely'
import { defineMcpTool, mcpError, mcpLog, type McpToolContext } from '#mcp-layer'
import type { Database as CoreDatabase } from '#core/server/database/schema'
import { runInOrgTransaction } from '#tenant/server'
import { getPortfolioSections } from '../utils/section-settings'
import { loadSection, saveSectionContent, isKnownSectionKey } from '../utils/section-helpers'

function asAuditExecutor(tx: unknown): Kysely<CoreDatabase> {
  return tx as Kysely<CoreDatabase>
}

function textResult(text: string, structured?: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(structured ? { structuredContent: structured } : {})
  }
}

export const listOrgsTool = defineMcpTool({
  name: 'list_orgs',
  description: 'List organizations the bearer is a member of. Returns org id, slug, and name. Use these to filter portfolios via list_portfolios.',
  scope: 'context.read',
  input: z.object({}).strict(),
  handler: async (_input, ctx) => {
    try {
      // The MCP server's tenancy middleware resolves the active org from the
      // X-Active-Org header. We use the user's membership table directly so
      // the response lists ALL orgs the bearer can switch to, not just the
      // currently active one.
      return await runInOrgTransaction(ctx.event, async (tx) => {
        const rows = await tx
          .selectFrom('memberships as m')
          .innerJoin('orgs as o', 'o.id', 'm.org_id')
          .select(['o.id', 'o.slug', 'o.name'])
          .where('m.user_id', '=', ctx.auth.userId)
          .orderBy('o.name', 'asc')
          .distinct()
          .execute()
        return textResult(`${rows.length} org(s).`, { orgs: rows })
      })
    } catch (err) { return mcpError(err) }
  }
})

export const listPortfoliosTool = defineMcpTool({
  name: 'list_portfolios',
  description: 'List portfolios in the active organization. Returns portfolio id, slug, name, color, icon_url, created_at, updated_at.',
  scope: 'context.read',
  input: z.object({}).strict(),
  handler: async (_input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, async (tx) => {
        const rows = await tx
          .selectFrom('context_portfolios')
          .select(['id', 'slug', 'name', 'color', 'icon_url', 'created_at', 'updated_at'])
          .orderBy('name', 'asc')
          .execute()
        return textResult(`${rows.length} portfolio(s).`, { portfolios: rows })
      })
    } catch (err) { return mcpError(err) }
  }
})

export const listSectionsTool = defineMcpTool({
  name: 'list_sections',
  description: 'List all sections in a portfolio with titles, descriptions, content_length, and last_edited_at. Survey step: use content_length to decide which sections to load.',
  scope: 'context.read',
  input: z.object({ portfolio_id: z.string().uuid() }).strict(),
  handler: async (input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, async (tx) => {
        const exists = await tx
          .selectFrom('context_portfolios')
          .select('id')
          .where('id', '=', input.portfolio_id)
          .executeTakeFirst()
        if (!exists) throw createError({ statusCode: 404, statusMessage: 'Portfolio not found.' })

        const defs = await getPortfolioSections(tx, input.portfolio_id)
        const rows = await tx
          .selectFrom('context_sections')
          .select(['section_key', 'content', 'last_edited_at'])
          .where('portfolio_id', '=', input.portfolio_id)
          .execute()
        const byKey = new Map(rows.map(r => [r.section_key as string, r]))
        const result = defs.map((d) => {
          const r = byKey.get(d.key)
          const content = (r?.content ?? '') as string
          return {
            key: d.key,
            title: d.title,
            description: d.description,
            has_content: content.trim().length > 0,
            content_length: content.length,
            last_edited_at: r?.last_edited_at ? new Date(r.last_edited_at as Date).toISOString() : null
          }
        })
        return textResult(`${result.length} section(s).`, { sections: result })
      })
    } catch (err) { return mcpError(err) }
  }
})

export const readSectionTool = defineMcpTool({
  name: 'read_section',
  description: 'Read the markdown content of a single portfolio section. Returns content and last_edited_at (pass last_edited_at to update_section for optimistic-lock conflict detection).',
  scope: 'context.read',
  input: z.object({
    portfolio_id: z.string().uuid(),
    section_key: z.string().min(1).max(64)
  }).strict(),
  handler: async (input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, async (tx) => {
        const exists = await tx
          .selectFrom('context_portfolios')
          .select('id')
          .where('id', '=', input.portfolio_id)
          .executeTakeFirst()
        if (!exists) throw createError({ statusCode: 404, statusMessage: 'Portfolio not found.' })

        const known = await isKnownSectionKey(tx, input.portfolio_id, input.section_key)
        if (!known) throw createError({ statusCode: 404, statusMessage: `Unknown section key: ${input.section_key}` })

        const section = await loadSection(tx, input.portfolio_id, input.section_key)
        const defs = await getPortfolioSections(tx, input.portfolio_id)
        const def = defs.find(d => d.key === input.section_key)
        const result = {
          key: input.section_key,
          title: def?.title ?? input.section_key,
          content: section?.content ?? '',
          last_edited_at: section?.last_edited_at ? new Date(section.last_edited_at).toISOString() : null
        }
        return textResult(`Section "${result.title}" (${result.content.length} chars).`, result)
      })
    } catch (err) { return mcpError(err) }
  }
})

export const bulkReadSectionsTool = defineMcpTool({
  name: 'bulk_read_sections',
  description: 'Read multiple portfolio sections in a single call. Validates all keys up front; rejects unknown keys.',
  scope: 'context.read',
  input: z.object({
    portfolio_id: z.string().uuid(),
    section_keys: z.array(z.string().min(1).max(64)).min(1).max(50)
  }).strict(),
  handler: async (input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, async (tx) => {
        const defs = await getPortfolioSections(tx, input.portfolio_id)
        const knownKeys = new Set(defs.map(d => d.key))
        const unknown = input.section_keys.filter(k => !knownKeys.has(k))
        if (unknown.length > 0) {
          throw createError({ statusCode: 404, statusMessage: `Unknown section keys: ${unknown.join(', ')}` })
        }

        const rows = await tx
          .selectFrom('context_sections')
          .select(['section_key', 'content', 'last_edited_at'])
          .where('portfolio_id', '=', input.portfolio_id)
          .where('section_key', 'in', input.section_keys)
          .execute()
        const byKey = new Map(rows.map(r => [r.section_key as string, r]))

        const sections = input.section_keys.map((key) => {
          const r = byKey.get(key)
          const def = defs.find(d => d.key === key)
          return {
            key,
            title: def?.title ?? key,
            content: (r?.content as string) ?? '',
            last_edited_at: r?.last_edited_at ? new Date(r.last_edited_at as Date).toISOString() : null
          }
        })
        return textResult(`Read ${sections.length} section(s).`, { sections })
      })
    } catch (err) { return mcpError(err) }
  }
})

export const readOrganizationTool = defineMcpTool({
  name: 'read_organization',
  description: 'Read all sections of a portfolio in one call (sections + content). Use when you need broad context across the whole portfolio.',
  scope: 'context.read',
  input: z.object({ portfolio_id: z.string().uuid() }).strict(),
  handler: async (input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, async (tx) => {
        const p = await tx
          .selectFrom('context_portfolios')
          .select(['id', 'slug', 'name'])
          .where('id', '=', input.portfolio_id)
          .executeTakeFirst()
        if (!p) throw createError({ statusCode: 404, statusMessage: 'Portfolio not found.' })

        const defs = await getPortfolioSections(tx, input.portfolio_id)
        const rows = await tx
          .selectFrom('context_sections')
          .select(['section_key', 'content', 'last_edited_at'])
          .where('portfolio_id', '=', input.portfolio_id)
          .execute()
        const byKey = new Map(rows.map(r => [r.section_key as string, r]))

        const sections = defs.map((d) => {
          const r = byKey.get(d.key)
          return {
            key: d.key,
            title: d.title,
            description: d.description,
            content: (r?.content as string) ?? '',
            last_edited_at: r?.last_edited_at ? new Date(r.last_edited_at as Date).toISOString() : null
          }
        })

        return textResult(`Portfolio "${p.name}" (${sections.length} sections).`, {
          portfolio: { id: p.id, slug: p.slug, name: p.name },
          sections
        })
      })
    } catch (err) { return mcpError(err) }
  }
})

export const updateSectionTool = defineMcpTool({
  name: 'update_section',
  description: 'Update the markdown content of a portfolio section. Creates a version snapshot. Pass last_edited_at (ISO timestamp from a prior read) to enable optimistic-lock conflict detection.',
  scope: 'context.write',
  input: z.object({
    portfolio_id: z.string().uuid(),
    section_key: z.string().min(1).max(64),
    content: z.string(),
    last_edited_at: z.string().datetime().optional()
  }).strict(),
  handler: async (input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, async (tx) => {
        const exists = await tx
          .selectFrom('context_portfolios')
          .select('id')
          .where('id', '=', input.portfolio_id)
          .executeTakeFirst()
        if (!exists) throw createError({ statusCode: 404, statusMessage: 'Portfolio not found.' })

        const known = await isKnownSectionKey(tx, input.portfolio_id, input.section_key)
        if (!known) throw createError({ statusCode: 404, statusMessage: `Unknown section key: ${input.section_key}` })

        if (input.last_edited_at) {
          const cur = await loadSection(tx, input.portfolio_id, input.section_key)
          if (cur && cur.last_edited_at) {
            const currentIso = new Date(cur.last_edited_at).toISOString()
            if (currentIso !== new Date(input.last_edited_at).toISOString()) {
              return textResult('Conflict — section was modified since your read.', {
                key: input.section_key,
                status: 'conflict',
                reason: 'Section was modified after your last read. Re-read before updating.',
                current_last_edited_at: currentIso,
                your_last_edited_at: input.last_edited_at
              })
            }
          }
        }

        const { section, versionId } = await saveSectionContent(
          tx, input.portfolio_id, input.section_key, input.content, ctx.auth.userId
        )

        await mcpLog('UPDATE', 'context_sections', section.id, ctx, {
          portfolio_id: input.portfolio_id,
          key: input.section_key,
          version_id: versionId
        }, asAuditExecutor(tx))

        return textResult(`Updated section "${input.section_key}".`, {
          key: input.section_key,
          status: 'updated' as const,
          last_edited_at: new Date(section.last_edited_at).toISOString(),
          version_id: versionId
        })
      })
    } catch (err) { return mcpError(err) }
  }
})

export const bulkUpdateSectionsTool = defineMcpTool({
  name: 'bulk_update_sections',
  description: 'Update multiple portfolio sections in a single call. Each update may include last_edited_at for optimistic-lock conflict detection. Conflicted sections are skipped; sections that pass are still updated.',
  scope: 'context.write',
  input: z.object({
    portfolio_id: z.string().uuid(),
    updates: z.array(z.object({
      section_key: z.string().min(1).max(64),
      content: z.string(),
      last_edited_at: z.string().datetime().optional()
    })).min(1).max(20)
  }).strict(),
  handler: async (input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, async (tx) => {
        const exists = await tx
          .selectFrom('context_portfolios')
          .select('id')
          .where('id', '=', input.portfolio_id)
          .executeTakeFirst()
        if (!exists) throw createError({ statusCode: 404, statusMessage: 'Portfolio not found.' })

        const results: Array<Record<string, unknown>> = []
        for (const u of input.updates) {
          const known = await isKnownSectionKey(tx, input.portfolio_id, u.section_key)
          if (!known) {
            results.push({ key: u.section_key, status: 'error', reason: `Unknown section key: ${u.section_key}` })
            continue
          }
          if (u.last_edited_at) {
            const cur = await loadSection(tx, input.portfolio_id, u.section_key)
            if (cur?.last_edited_at) {
              const currentIso = new Date(cur.last_edited_at).toISOString()
              if (currentIso !== new Date(u.last_edited_at).toISOString()) {
                results.push({
                  key: u.section_key,
                  status: 'conflict',
                  reason: 'Section was modified after your last read.',
                  current_last_edited_at: currentIso,
                  your_last_edited_at: u.last_edited_at
                })
                continue
              }
            }
          }
          const { section, versionId } = await saveSectionContent(
            tx, input.portfolio_id, u.section_key, u.content, ctx.auth.userId
          )
          await mcpLog('UPDATE', 'context_sections', section.id, ctx, {
            portfolio_id: input.portfolio_id, key: u.section_key, version_id: versionId
          }, asAuditExecutor(tx))
          results.push({
            key: u.section_key,
            status: 'updated',
            last_edited_at: new Date(section.last_edited_at).toISOString(),
            version_id: versionId
          })
        }
        return textResult(`Processed ${results.length} update(s).`, { results })
      })
    } catch (err) { return mcpError(err) }
  }
})

export const contextMcpTools = [
  listOrgsTool,
  listPortfoliosTool,
  listSectionsTool,
  readSectionTool,
  bulkReadSectionsTool,
  readOrganizationTool,
  updateSectionTool,
  bulkUpdateSectionsTool
]

// Suppress unused-imports warning when sql isn't directly referenced — the
// import is kept for symmetry with other layers' MCP files.
export const _sql = sql
