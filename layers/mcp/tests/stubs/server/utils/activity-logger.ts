// Test stub for ~~/server/utils/activity-logger. Captures emitted events in
// a per-test array so unit tests can assert on the audit-log shape.

interface CapturedEvent {
  eventType: string
  tableName?: string
  recordId?: string
  userId?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

const _events: CapturedEvent[] = []

export function getCapturedEvents(): CapturedEvent[] {
  return [..._events]
}

export function clearCapturedEvents(): void {
  _events.length = 0
}

export async function logEvent(
  options: {
    eventType: string
    tableName?: string
    recordId?: string
    userId?: string
    userAgent?: string
    metadata?: Record<string, unknown>
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _executor?: unknown
): Promise<void> {
  _events.push({ ...options })
}
