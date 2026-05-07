import type { Kysely } from 'kysely'
import { logEvent } from '#core/server/utils/activity-logger'
import type { Database } from '#core/server/database/schema'
import type { McpToolContext } from '../mcp-layer/define'

// Standard audit wrapper for MCP write tools. Always passes ctx.auth.userId
// (string), never ctx.event — the activity-logger's H3Event branch reads the
// admin auth-token cookie which MCP requests don't carry.
//
// Inside a transaction, pass `executor: tx` so the audit insert lands on the
// transaction's connection. The high-level logCreate/logUpdate/logDelete
// helpers don't accept an executor and would commit on the global db
// connection — surviving a transaction rollback as an audit-trail lie.
export async function mcpLog(
  event: 'CREATE' | 'UPDATE' | 'DELETE',
  table: string,
  recordId: string,
  ctx: McpToolContext,
  changes: Record<string, unknown> = {},
  executor?: Kysely<Database>
): Promise<void> {
  const userAgent = getHeader(ctx.event, 'user-agent') || undefined
  const metadata = {
    source: 'mcp',
    client_id: ctx.auth.clientId,
    tool: ctx.tool.name,
    scope: ctx.tool.scope,
    ...changes
  }
  await logEvent(
    {
      eventType: event,
      tableName: table,
      recordId,
      userId: ctx.auth.userId,
      userAgent,
      metadata
    },
    executor,
    // Inside a transaction the audit insert is part of the atomic
    // operation — a swallowed failure would leave the data write
    // committed without an audit row, which is the exact failure mode
    // the audit log exists to prevent. Outside a transaction there is
    // nothing to roll back; preserve the legacy fire-and-forget shape.
    executor ? { throwOnError: true } : undefined
  )
}

// Records a rejected write (validation, permission, conflict) so the audit log
// captures the attempt. Never includes raw input bodies or token material.
export async function mcpLogWriteRejected(
  ctx: McpToolContext,
  reason: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const userAgent = getHeader(ctx.event, 'user-agent') || undefined
  await logEvent({
    eventType: 'mcp.write_rejected',
    userId: ctx.auth.userId,
    userAgent,
    metadata: {
      source: 'mcp',
      client_id: ctx.auth.clientId,
      tool: ctx.tool.name,
      scope: ctx.tool.scope,
      reason,
      ...extra
    }
  })
}
