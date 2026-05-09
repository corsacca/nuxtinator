import type { Ref } from 'vue'

/**
 * Polling composable. Calls `refetch` every `intervalMs` ms unless
 * `pause.value === true`. SSR-safe (no-op on server).
 */
export function useBoardPoll(
  refetch: () => Promise<void> | void,
  pause: Ref<boolean>,
  intervalMs = 5000
): { start: () => void; stop: () => void } {
  let handle: ReturnType<typeof setInterval> | null = null

  function start() {
    if (!import.meta.client) return
    if (handle !== null) return
    handle = setInterval(() => {
      if (pause.value) return
      try {
        const r = refetch()
        if (r && typeof (r as Promise<void>).catch === 'function') {
          ;(r as Promise<void>).catch((err) => {
            console.error('useBoardPoll refetch failed:', err)
          })
        }
      } catch (err) {
        console.error('useBoardPoll refetch threw:', err)
      }
    }, intervalMs)
  }

  function stop() {
    if (handle !== null) {
      clearInterval(handle)
      handle = null
    }
  }

  onBeforeUnmount(() => {
    stop()
  })

  return { start, stop }
}
