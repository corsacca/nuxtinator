import { ZodError } from 'zod'
import type { McpToolResult } from './define'

interface H3LikeError {
  statusCode?: number
  statusMessage?: string
  message?: string
  data?: { entity?: string; message?: string } | undefined
}

function isH3LikeError(err: unknown): err is H3LikeError {
  return typeof err === 'object' && err !== null && 'statusCode' in err
}

function asText(text: string): McpToolResult<never> {
  return {
    content: [{ type: 'text', text }],
    isError: true
  }
}

// Maps an unknown thrown value (h3 error, ZodError, anything) to an MCP-shaped
// `isError` tool result. Never includes stack traces, SQL fragments, or token
// material in the user-facing text.
export function mcpError(err: unknown): McpToolResult<never> {
  if (err instanceof ZodError) {
    const flat = err.flatten() as { fieldErrors: Record<string, string[] | undefined>, formErrors: string[] }
    const fieldErrors = Object.entries(flat.fieldErrors)
      .map(([k, msgs]) => `${k}: ${(msgs ?? []).join(', ')}`)
      .filter(Boolean)
      .join('; ')
    const formErrors = (flat.formErrors ?? []).join(', ')
    const text = [formErrors, fieldErrors].filter(Boolean).join('. ') || 'Validation failed'
    return asText(text)
  }

  if (isH3LikeError(err)) {
    const status = err.statusCode ?? 500
    const detail = err.data?.message || err.statusMessage || err.message || ''
    if (status === 400) {
      return asText(detail || 'Bad request')
    }
    if (status === 403) {
      return asText(detail ? `Forbidden: ${detail}` : "You don't have permission to perform this action")
    }
    if (status === 404) {
      const entity = err.data?.entity
      return asText(entity ? `${entity} not found` : detail || 'Not found')
    }
    if (status === 409) {
      return asText(detail || 'Conflict')
    }
    if (status === 422) {
      return asText(detail || 'Unprocessable entity')
    }
    if (status >= 400 && status < 500) {
      return asText(detail || 'Request failed')
    }
    // 5xx → log server-side, return generic message
    console.error('[mcp-layer] Internal error in tool handler:', err)
    return asText('Internal error')
  }

  console.error('[mcp-layer] Unexpected error in tool handler:', err)
  return asText('Internal error')
}
