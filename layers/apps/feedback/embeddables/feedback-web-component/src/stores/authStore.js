/**
 * authStore — per-instance Pinia store for token + user state.
 *
 * Token is also mirrored to localStorage under the shared TOKEN_KEY so that
 * multiple <feedback-web-component> instances on the same host page see the same
 * session. The store reads from localStorage on init; any instance writing a
 * new token triggers a storage event that other instances listen for
 * (bootstrapped in the chat-bubble profile).
 */

import { defineStore } from 'pinia'

export const TOKEN_KEY = 'fw-token'

function loadToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: loadToken(),
    user: null,
    authChecking: false,
    authError: ''
  }),

  getters: {
    isAuthed: state => Boolean(state.user)
  },

  actions: {
    setToken(token) {
      this.token = token || ''
      try {
        if (token) localStorage.setItem(TOKEN_KEY, token)
        else localStorage.removeItem(TOKEN_KEY)
      } catch {
        /* ignore */
      }
    },

    setUser(user) {
      this.user = user
    },

    reset() {
      this.setToken('')
      this.user = null
      this.authError = ''
    }
  }
})
