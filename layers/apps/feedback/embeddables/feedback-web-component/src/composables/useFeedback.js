/**
 * useFeedback — encapsulates the auth + submit + list-my-feedback flow against
 * the Kanban backend. The chat-bubble profile consumes this; future profiles
 * (inline form, modal) can share it.
 */

import { ref, inject, computed } from 'vue'
import { useAuthStore, TOKEN_KEY } from '../stores/authStore.js'
import { useApi } from './useApi.js'

export function useFeedback() {
  const auth = useAuthStore()
  const api = useApi()
  const projectId = inject('projectId')

  const submissions = ref([])
  const submissionsLoading = ref(false)
  const submissionsError = ref('')

  const project = ref(null)
  const projectError = ref('')

  async function loadProject() {
    project.value = null
    projectError.value = ''
    if (!projectId?.value) return
    try {
      const data = await api.request(`/api/v1/project/${encodeURIComponent(projectId.value)}`)
      project.value = data
    } catch (e) {
      projectError.value = e.status === 404
        ? 'Unknown project — check the projectId in profile-config.'
        : (e.message || 'Failed to load project')
    }
  }

  async function refreshMe() {
    // First-party (in-app) sessions live in an httpOnly cookie, so there's no
    // widget token to gate on — always ask the server who we are. Cross-origin
    // embeds with no bearer token are anonymous and skip the round-trip.
    if (!auth.token && !api.firstParty.value) {
      auth.setUser(null)
      return
    }
    auth.authChecking = true
    auth.authError = ''
    try {
      const data = await api.request('/api/auth/me')
      auth.setUser(data.user)
    } catch (e) {
      if (e.status === 401) auth.reset()
      else auth.authError = e.message
    } finally {
      auth.authChecking = false
    }
  }

  async function login({ email, password }) {
    const data = await api.request('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    })
    if (!data?.token) throw new Error('Server did not return a token')
    auth.setToken(data.token)
    auth.setUser(data.user)
    return data
  }

  async function register({ email, password, display_name }) {
    const data = await api.request('/api/auth/register', {
      method: 'POST',
      body: { email, password, display_name }
    })
    if (data?.autoLoggedIn && data.token) {
      auth.setToken(data.token)
      auth.setUser(data.user)
    }
    return data
  }

  function logout() {
    auth.reset()
    submissions.value = []
  }

  async function loadSubmissions() {
    if (!auth.isAuthed || !projectId?.value) {
      submissions.value = []
      return
    }
    submissionsLoading.value = true
    submissionsError.value = ''
    try {
      const rows = await api.request(
        `/api/v1/feedback?project_id=${encodeURIComponent(projectId.value)}`
      )
      submissions.value = Array.isArray(rows) ? rows : []
    } catch (e) {
      submissionsError.value = e.message || 'Failed to load submissions'
    } finally {
      submissionsLoading.value = false
    }
  }

  async function submit(payload, { screenshot = null, attachments = [] } = {}) {
    // Submission is open to anonymous callers — the backend sets
    // submitter_user_id to null when no bearer token is present. Authed users
    // still get their submissions tied to their account.
    if (!projectId?.value) throw new Error('Missing projectId')

    const body = {
      project_id: projectId.value,
      ...payload,
      page_url: window.location.href,
      page_path: window.location.pathname,
      locale: navigator.language,
      referrer: document.referrer,
      client_context: captureClientContext()
    }

    const hasFiles = Boolean(screenshot) || (Array.isArray(attachments) && attachments.length > 0)

    if (hasFiles) {
      const fd = new FormData()
      fd.append('payload', JSON.stringify(body))
      if (screenshot) {
        fd.append('screenshot', screenshot, 'screenshot.png')
      }
      for (const file of attachments) {
        fd.append('attachments', file, file.name)
      }
      await api.request('/api/v1/feedback', { method: 'POST', body: fd })
    } else {
      await api.request('/api/v1/feedback', { method: 'POST', body })
    }
    if (auth.isAuthed) await loadSubmissions()
  }

  // Cross-instance token sync: when another web component on the page logs in/out,
  // mirror that here so both UIs stay in sync without a page reload.
  function bindStorageSync() {
    const handler = (ev) => {
      if (ev.key !== TOKEN_KEY) return
      auth.token = ev.newValue || ''
      if (!ev.newValue) {
        auth.setUser(null)
        submissions.value = []
      } else {
        refreshMe().then(() => auth.isAuthed && loadSubmissions())
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }

  return {
    auth,
    projectId: computed(() => projectId?.value || ''),
    project,
    projectError,
    loadProject,
    submissions,
    submissionsLoading,
    submissionsError,
    refreshMe,
    login,
    register,
    logout,
    loadSubmissions,
    submit,
    bindStorageSync,
    firstParty: api.firstParty
  }
}

function captureClientContext() {
  const ua = navigator.userAgent || ''
  const uaData = navigator.userAgentData || null
  const isMobile = typeof uaData?.mobile === 'boolean'
    ? uaData.mobile
    : /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    screen: { w: screen.width, h: screen.height },
    dpr: window.devicePixelRatio,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    color_scheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    connection: navigator.connection?.effectiveType || null,
    query: window.location.search,
    hash: window.location.hash,
    user_agent: ua,
    device_type: isMobile ? 'mobile' : 'desktop',
    is_mobile: isMobile,
    platform: uaData?.platform || detectPlatform(ua),
    browser: detectBrowser(ua),
    ua_brands: Array.isArray(uaData?.brands) ? uaData.brands : null
  }
}

function detectPlatform(ua) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'
  if (/Android/i.test(ua)) return 'Android'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS'
  if (/CrOS/i.test(ua)) return 'ChromeOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return ''
}

function detectBrowser(ua) {
  if (/Edg\//i.test(ua)) return 'Edge'
  if (/OPR\/|Opera\//i.test(ua)) return 'Opera'
  if (/Firefox\//i.test(ua)) return 'Firefox'
  if (/Chrome\//i.test(ua)) return 'Chrome'
  if (/Safari\//i.test(ua)) return 'Safari'
  return ''
}
