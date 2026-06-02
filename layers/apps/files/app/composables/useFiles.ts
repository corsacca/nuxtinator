// Shared types + thin fetch helpers for the files layer. State lives in the
// consuming pages (plain refs + reload-after-write) to dodge useAsyncData's
// cross-component stale cache. Always uses `$fetch` so the tenancy interceptor
// (X-Active-Org header) is picked up at call time.

export type FilesItemKind = 'doc' | 'file'

export interface FilesItemSummary {
  id: string
  kind: FilesItemKind
  title: string
  filename: string | null
  mime: string | null
  size_bytes: string | null
  tags: string[]
  created_at: string
  last_edited_at: string | null
  created_by: string | null
  created_by_name: string | null
  has_link: boolean
}

export interface FilesItemDetail extends FilesItemSummary {
  body_md: string | null
  url: string | null
  share_token: string | null
}

export interface FilesVersion {
  id: string
  title: string
  content: string
  edited_at: string
  edited_by: string | null
  edited_by_name: string | null
}

export function useFiles() {
  async function list(tag?: string): Promise<FilesItemSummary[]> {
    const res = await $fetch<{ items: FilesItemSummary[] }>('/api/files/items', {
      query: tag ? { tag } : undefined
    })
    return res.items
  }

  async function get(id: string): Promise<FilesItemDetail> {
    const res = await $fetch<{ item: FilesItemDetail }>(`/api/files/items/${id}`)
    return res.item
  }

  async function createDoc(input: { title: string, body_md?: string, tags?: string[] }) {
    return await $fetch<{ item: { id: string } }>('/api/files/items', {
      method: 'POST',
      body: input
    })
  }

  async function update(id: string, input: { title?: string, body_md?: string, tags?: string[] }) {
    return await $fetch<{ item: FilesItemDetail }>(`/api/files/items/${id}`, {
      method: 'PATCH',
      body: input
    })
  }

  async function remove(id: string) {
    return await $fetch(`/api/files/items/${id}`, { method: 'DELETE' })
  }

  // Swap the binary on an uploaded (kind='file') item, keeping its id + share link.
  async function replaceFile(id: string, file: File) {
    const fd = new FormData()
    fd.append('file', file)
    return await $fetch<{ item: FilesItemSummary }>(`/api/files/items/${id}/replace`, {
      method: 'POST',
      body: fd
    })
  }

  async function listVersions(id: string): Promise<FilesVersion[]> {
    const res = await $fetch<{ versions: FilesVersion[] }>(`/api/files/items/${id}/versions`)
    return res.versions
  }

  async function restoreVersion(id: string, versionId: string) {
    return await $fetch(`/api/files/items/${id}/versions/${versionId}/restore`, { method: 'POST' })
  }

  async function issueLink(id: string): Promise<string> {
    const res = await $fetch<{ share_token: string }>(`/api/files/items/${id}/share`, { method: 'POST' })
    return res.share_token
  }

  async function revokeLink(id: string) {
    return await $fetch(`/api/files/items/${id}/share`, { method: 'DELETE' })
  }

  async function search(q: string): Promise<Array<FilesItemSummary & { headline: string }>> {
    const res = await $fetch<{ items: Array<FilesItemSummary & { headline: string }> }>('/api/files/search', {
      query: { q }
    })
    return res.items
  }

  function publicUrl(token: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/files/public/${token}`
  }

  return {
    list, get, createDoc, update, remove, replaceFile,
    listVersions, restoreVersion, issueLink, revokeLink, search, publicUrl
  }
}

// Human-readable byte size for file rows.
export function formatBytes(bytes: string | number | null): string {
  if (bytes == null) return ''
  const n = typeof bytes === 'string' ? Number(bytes) : bytes
  if (!Number.isFinite(n) || n <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// Pick an icon for a file row based on mime / kind.
export function iconForItem(item: { kind: FilesItemKind, mime: string | null }): string {
  if (item.kind === 'doc') return 'i-lucide-file-text'
  const mime = item.mime ?? ''
  if (mime.startsWith('image/')) return 'i-lucide-image'
  if (mime.startsWith('video/')) return 'i-lucide-video'
  if (mime.startsWith('audio/')) return 'i-lucide-music'
  if (mime === 'application/pdf') return 'i-lucide-file-type'
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar')) return 'i-lucide-file-archive'
  return 'i-lucide-file'
}
