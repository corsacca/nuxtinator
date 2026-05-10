/**
 * useApi — thin fetch wrapper scoped to one api-base. Attaches Authorization:
 * Bearer header from the auth store when present, parses JSON, normalizes
 * error shape so callers can branch on e.status.
 */

import { inject } from 'vue'
import { useAuthStore } from '../stores/authStore.js'

export function useApi() {
  const apiBase = inject('apiBase')
  const auth = useAuthStore()

  function url(path) {
    const base = (apiBase?.value || '').replace(/\/$/, '')
    return `${base}${path}`
  }

  async function request(path, { method = 'GET', body } = {}) {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
    // For FormData let the browser set Content-Type with the multipart boundary;
    // setting it manually breaks the request.
    const headers = isFormData ? {} : { 'Content-Type': 'application/json' }
    if (auth.token) headers.Authorization = `Bearer ${auth.token}`

    const res = await fetch(url(path), {
      method,
      headers,
      credentials: 'omit',
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined
    })

    if (res.status === 204) return null

    const text = await res.text()
    const data = text ? safeJson(text) : null

    if (!res.ok) {
      const err = new Error(data?.statusMessage || data?.message || `HTTP ${res.status}`)
      err.status = res.status
      err.data = data
      throw err
    }
    return data
  }

  return { request, url }
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
