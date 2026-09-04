import { sql, type RawBuilder } from 'kysely'

// jsonb write binding. The value is stringified and bound as text, then cast,
// so the driver never JSON-encodes it a second time into a string scalar.
export function gmailJson<T = unknown>(value: unknown): RawBuilder<T> {
  return sql<T>`${JSON.stringify(value ?? null)}::text::jsonb`
}
