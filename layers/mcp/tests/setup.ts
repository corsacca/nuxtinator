// Vitest global setup. Installs Nitro globals (useStorage, useRuntimeConfig,
// createError, getHeader, setResponseHeader) onto globalThis so layer code
// that references them at runtime resolves outside Nitro.
import { afterEach } from 'vitest'
import { installNitroGlobals, clearTestStorage, setTestRuntimeConfig } from './stubs/nitro-globals'
import { clearUserPermissions } from './stubs/server/utils/rbac'
import { clearCapturedEvents } from './stubs/server/utils/activity-logger'

installNitroGlobals()

afterEach(() => {
  clearTestStorage()
  clearUserPermissions()
  clearCapturedEvents()
  setTestRuntimeConfig({})
})
