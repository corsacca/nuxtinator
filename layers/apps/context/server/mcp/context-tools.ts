// MCP tool definitions for the context layer.
//
// Scopes track the equivalent HTTP routes' permissions: reads use
// `context.read`; section-content writes use `context.write`; creating a
// portfolio requires the portfolio-create permission; adding or removing a
// custom section definition requires the custom-section permission.
// All tools except `list_orgs` take an optional `org` slug and run inside
// `runInOrgTransaction(event, { org, userId }, ...)` from `#tenant/server`,
// which in multi mode resolves the org (the `org` input, else the
// `X-Active-Org` header on the MCP HTTP request), enforces the bearer's
// membership, and sets the active-org GUC; in single mode it is a plain
// transaction. The transaction spans the whole handler, so a tool that
// returns an error has written nothing.
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
import { slugifyPortfolioName, ensureUniqueSlug, getPortfolioById } from '../utils/portfolio-helpers'
import { CONTEXT_SECTION_KEYS, slugifySectionTitle } from '../utils/section-catalog'

function asAuditExecutor(tx: unknown): Kysely<CoreDatabase> {
  return tx as Kysely<CoreDatabase>
}

// Org slug selecting which org the tool runs in. Optional so clients pinned
// to one org via a fixed `X-Active-Org` header keep working unchanged.
const orgInput = z.string().min(1).max(64).optional()
  .describe('Org slug to operate in. Defaults to the X-Active-Org header sent by the client.')

function textResult(text: string, structured?: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(structured ? { structuredContent: structured } : {})
  }
}

export const listOrgsTool = defineMcpTool({
  name: 'list_orgs',
  description: 'List organizations the bearer is a member of. Returns org id, slug, and name. Pass a slug as `org` to any other tool to operate in that org.',
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
  input: z.object({ org: orgInput }).strict(),
  handler: async (input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, { org: input.org, userId: ctx.auth.userId }, async (tx) => {
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
  input: z.object({ org: orgInput, portfolio_id: z.string().uuid() }).strict(),
  handler: async (input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, { org: input.org, userId: ctx.auth.userId }, async (tx) => {
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
            is_custom: d.is_custom,
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
    org: orgInput,
    portfolio_id: z.string().uuid(),
    section_key: z.string().min(1).max(64)
  }).strict(),
  handler: async (input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, { org: input.org, userId: ctx.auth.userId }, async (tx) => {
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
    org: orgInput,
    portfolio_id: z.string().uuid(),
    section_keys: z.array(z.string().min(1).max(64)).min(1).max(50)
  }).strict(),
  handler: async (input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, { org: input.org, userId: ctx.auth.userId }, async (tx) => {
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
  input: z.object({ org: orgInput, portfolio_id: z.string().uuid() }).strict(),
  handler: async (input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, { org: input.org, userId: ctx.auth.userId }, async (tx) => {
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
            is_custom: d.is_custom,
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
  description: 'Update the markdown content of a portfolio section. Creates a version snapshot. Pass last_edited_at (ISO timestamp from a prior read) to enable optimistic-lock conflict detection. Atomic: if the call returns an error, nothing was written.',
  scope: 'context.write',
  input: z.object({
    org: orgInput,
    portfolio_id: z.string().uuid(),
    section_key: z.string().min(1).max(64),
    content: z.string(),
    last_edited_at: z.string().datetime().optional()
  }).strict(),
  handler: async (input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, { org: input.org, userId: ctx.auth.userId }, async (tx) => {
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
          tx, input.portfolio_id, input.section_key, input.content, ctx.auth.userId, { source: 'mcp' }
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
  description: 'Update multiple portfolio sections in a single call. Each update may include last_edited_at for optimistic-lock conflict detection. Conflicted sections are skipped; sections that pass are still updated. Runs as one transaction: if the call returns an error, every update in it was rolled back and nothing was written.',
  scope: 'context.write',
  input: z.object({
    org: orgInput,
    portfolio_id: z.string().uuid(),
    updates: z.array(z.object({
      section_key: z.string().min(1).max(64),
      content: z.string(),
      last_edited_at: z.string().datetime().optional()
    })).min(1).max(20)
  }).strict(),
  handler: async (input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, { org: input.org, userId: ctx.auth.userId }, async (tx) => {
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
            tx, input.portfolio_id, u.section_key, u.content, ctx.auth.userId, { source: 'mcp' }
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

export const createPortfolioTool = defineMcpTool({
  name: 'create_portfolio',
  description: 'Create a portfolio in the active organization. The slug is derived from the name unless one is given, and a colliding slug is auto-suffixed (-2, -3) — read the returned slug and id rather than assuming them. The portfolio starts with the built-in sections and no content; write content with update_section.',
  scope: 'context.portfolio.create',
  input: z.object({
    org: orgInput,
    name: z.string().trim().min(1).max(120),
    color: z.string().trim().max(20).nullable().optional(),
    slug: z.string().trim().regex(/^[a-z][a-z0-9-]{1,39}$/).optional()
  }).strict(),
  handler: async (input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, { org: input.org, userId: ctx.auth.userId }, async (tx) => {
        const requestedSlug = input.slug ?? slugifyPortfolioName(input.name)
        const slug = await ensureUniqueSlug(tx, requestedSlug)

        const portfolio = await tx
          .insertInto('context_portfolios')
          .values({ slug, name: input.name, color: input.color ?? null })
          .returning(['id', 'slug', 'name', 'color', 'icon_url', 'created_at', 'updated_at'])
          .executeTakeFirstOrThrow()

        await mcpLog('CREATE', 'context_portfolios', portfolio.id, ctx, {
          slug: portfolio.slug,
          name: portfolio.name
        }, asAuditExecutor(tx))

        return textResult(`Created portfolio "${portfolio.name}" (${portfolio.slug}).`, { portfolio })
      })
    } catch (err) { return mcpError(err) }
  }
})

export const createSectionTool = defineMcpTool({
  name: 'create_section',
  description: 'Add a custom section to a portfolio. The section key is slugified from the title; the built-in section keys are reserved and a title that collides with one is rejected. Creates the section definition only — write its content afterwards with update_section.',
  scope: 'context.section.custom',
  input: z.object({
    org: orgInput,
    portfolio_id: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    order: z.number().int().min(0).optional()
  }).strict(),
  handler: async (input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, { org: input.org, userId: ctx.auth.userId }, async (tx) => {
        const portfolio = await getPortfolioById(tx, input.portfolio_id)
        if (!portfolio) throw createError({ statusCode: 404, statusMessage: 'Portfolio not found.' })

        const key = slugifySectionTitle(input.title)
        if (!key) {
          throw createError({ statusCode: 400, statusMessage: 'Title must contain at least one alphanumeric character.' })
        }
        if (CONTEXT_SECTION_KEYS.has(key)) {
          throw createError({ statusCode: 409, statusMessage: `Key "${key}" collides with a built-in section.` })
        }
        const existing = await tx
          .selectFrom('context_custom_section_definitions')
          .select('id')
          .where('portfolio_id', '=', input.portfolio_id)
          .where('key', '=', key)
          .executeTakeFirst()
        if (existing) {
          throw createError({ statusCode: 409, statusMessage: `Custom section "${key}" already exists in this portfolio.` })
        }

        const section = await tx
          .insertInto('context_custom_section_definitions')
          .values({
            portfolio_id: input.portfolio_id,
            key,
            title: input.title,
            description: input.description ?? '',
            order: input.order ?? 0,
            created_by: ctx.auth.userId
          })
          .returning(['id', 'key', 'title', 'description', 'order'])
          .executeTakeFirstOrThrow()

        await mcpLog('CREATE', 'context_custom_section_definitions', section.id, ctx, {
          portfolio_id: input.portfolio_id,
          key,
          title: input.title
        }, asAuditExecutor(tx))

        return textResult(
          `Created section "${section.title}" (key: ${section.key}). Write its content with update_section.`,
          { portfolio_id: input.portfolio_id, section }
        )
      })
    } catch (err) { return mcpError(err) }
  }
})

export const deleteSectionTool = defineMcpTool({
  name: 'delete_section',
  description: 'Remove a custom section from a portfolio. Only custom sections can be removed — the built-in sections are permanent. Any content saved under the key stays in the database but is no longer listed or readable; creating a section with the same title again restores it.',
  scope: 'context.section.custom',
  destructive: true,
  input: z.object({
    org: orgInput,
    portfolio_id: z.string().uuid(),
    section_key: z.string().min(1).max(64)
  }).strict(),
  handler: async (input, ctx) => {
    try {
      return await runInOrgTransaction(ctx.event, { org: input.org, userId: ctx.auth.userId }, async (tx) => {
        const portfolio = await getPortfolioById(tx, input.portfolio_id)
        if (!portfolio) throw createError({ statusCode: 404, statusMessage: 'Portfolio not found.' })

        if (CONTEXT_SECTION_KEYS.has(input.section_key)) {
          throw createError({
            statusCode: 400,
            statusMessage: `"${input.section_key}" is a built-in section and cannot be deleted. Only custom sections can be removed.`
          })
        }

        const definition = await tx
          .selectFrom('context_custom_section_definitions')
          .select(['id', 'key'])
          .where('portfolio_id', '=', input.portfolio_id)
          .where('key', '=', input.section_key)
          .executeTakeFirst()
        if (!definition) throw createError({ statusCode: 404, statusMessage: 'Custom section not found.' })

        const content = await loadSection(tx, input.portfolio_id, input.section_key)
        const contentRetained = (content?.content ?? '').length > 0

        await tx
          .deleteFrom('context_custom_section_definitions')
          .where('id', '=', definition.id)
          .execute()

        await mcpLog('DELETE', 'context_custom_section_definitions', definition.id, ctx, {
          portfolio_id: input.portfolio_id,
          key: definition.key
        }, asAuditExecutor(tx))

        return textResult(
          contentRetained
            ? `Deleted section "${definition.key}". Its content is retained but hidden until a section with the same key is created again.`
            : `Deleted section "${definition.key}".`,
          {
            key: definition.key,
            status: 'deleted' as const,
            id: definition.id,
            content_retained: contentRetained
          }
        )
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
  bulkUpdateSectionsTool,
  createPortfolioTool,
  createSectionTool,
  deleteSectionTool
]

// Suppress unused-imports warning when sql isn't directly referenced — the
// import is kept for symmetry with other layers' MCP files.
export const _sql = sql
