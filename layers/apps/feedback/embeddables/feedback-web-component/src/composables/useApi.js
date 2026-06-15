/**
 * useApi — thin fetch wrapper scoped to one api-base. Attaches Authorization:
 * Bearer header from the auth store when present, parses JSON, normalizes
 * error shape so callers can branch on e.status.
 */

import { inject, computed } from 'vue'
import { useAuthStore } from '../stores/authStore.js'

export function useApi() {
  const apiBase = inject('apiBase')
  const auth = useAuthStore()

  // First-party = the api origin is the same origin serving the page (the widget
  // is mounted in-app, not embedded on a third-party site). First-party requests
  // send credentials so the host's httpOnly `auth-token` session cookie rides
  // along and an already-signed-in user is recognized without a separate widget
  // login. A cross-origin embed can't send that cookie under SameSite, so it
  // omits credentials and authenticates with a bearer token instead.
  const firstParty = computed(() => {
    try {
      const base = apiBase?.value || ''
      if (!base) return false
      return new URL(base, window.location.href).origin === window.location.origin
    } catch {
      return false
    }
  })

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
      credentials: firstParty.value ? 'include' : 'omit',
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

  return { request, url, firstParty }
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
