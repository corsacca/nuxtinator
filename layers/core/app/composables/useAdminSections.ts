export interface AdminSection {
  appId: string
  title: string
  path: string
  icon?: string
  requiredPermission?: string
  order?: number
  parent?: string
}

interface AdminSectionsResponse {
  sections: AdminSection[]
}

export async function useAdminSections() {
  const { data, refresh, pending, error } = await useFetch<AdminSectionsResponse>('/api/_admin-sections', {
    default: () => ({ sections: [] })
  })

  const sections = computed<AdminSection[]>(() => data.value?.sections ?? [])

  return { sections, refresh, pending, error }
}
