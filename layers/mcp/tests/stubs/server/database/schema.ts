// Minimal Database type for the layer's mcp-audit.ts. Real consumer ships
// a much richer interface; tests only need it to compile.

export interface Database {
  activity_logs: {
    id: string
    timestamp: Date
    event_type: string
    table_name: string | null
    record_id: string | null
    user_id: string | null
    user_agent: string | null
    metadata: Record<string, unknown>
  }
}
