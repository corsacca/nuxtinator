export interface HelpinatorStatus {
  aiConfigured: boolean
  inboxAvailable: boolean
  canManage: boolean
  canElevate: boolean
}

export function useHelpinatorStatus() {
  return useFetch<HelpinatorStatus>('/api/helpinator/status', { key: 'helpinator-status' })
}
