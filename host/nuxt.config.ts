import { existsSync, rmSync } from 'node:fs'

declare const process: { env: Record<string, string | undefined> }

// Resolve where layers come from. In dev, set LAYERS_PATH (e.g. `../layers`)
// in `.env` to point at a local working copy. When unset (production / cloned
// downstream projects), `extends:` uses git URLs so Nuxt fetches via giget.
//
// Fill in `LAYERS_REMOTE` once layers are pushed to GitHub, e.g.:
//   const LAYERS_REMOTE = 'github:corsacca/go-saas/layers'
// Subdir-of-one-repo syntax: `${LAYERS_REMOTE}/<name>#<ref>`.
const LAYERS_PATH = process.env.LAYERS_PATH
const LAYERS_REMOTE = process.env.LAYERS_REMOTE || 'github:corsacca/go-saas/layers'
const LAYERS_REF = `#${process.env.LAYERS_REF || 'master'}`

function layer(name: string): string | [string, { install: true }] {
  if (LAYERS_PATH) return `${LAYERS_PATH}/${name}`
  return [
    `${LAYERS_REMOTE}/${name}${LAYERS_REF}`,
    { install: true }
  ]
}

// Strip layer-level tsconfig.json files. Layers extracted from full Nuxt
// projects sometimes ship a tsconfig.json that references ./.nuxt/tsconfig.*.json
// (only generated when the layer is opened as its own project). Vite's tsconfig
// walker would crash on the dangling references.
function stripLayerTsconfigs() {
  if (!LAYERS_PATH) return
  for (const name of [
    'core',
    'oauth',
    'mcp',
    'email-mailgun',
    'tenancy',
    'dev',
    'apps/calendar',
    'apps/kanban',
    'apps/messages',
    'apps/videos'
  ]) {
    const path = `${LAYERS_PATH}/${name}/tsconfig.json`
    if (existsSync(path)) rmSync(path)
  }
}

stripLayerTsconfigs()

// https://nuxt.com/docs/api/configuration/nuxt-config
//
// This is the host shell. Project-specific configuration lives here:
// branding, runtime config, the `extends:` list, and any project-specific
// page overrides under `app/pages/`. The framework foundation (auth, admin,
// registries, kernel, RBAC, etc.) lives in `layers/core/` and is the first
// thing extended below.
export default defineNuxtConfig({

  extends: [
    // Foundation. Auth, admin, registries, kernel, RBAC, chrome.
    layer('core'),
    // Tenancy is optional. Comment out to deploy single-tenant. Layers under
    // `../layers/` are NOT auto-discovered by Nuxt — its glob runs at
    // `host/layers/*` (which is empty), so each layer here is explicit.
    layer('tenancy'),
    // Email backend — pick one (mailgun / smtp / ses / ...). Provides `#email`.
    // If none is loaded, code that imports from `#email` throws helpfully.
    layer('email-mailgun'),
    layer('oauth'),
    layer('mcp'),
    layer('apps/calendar'),
    layer('apps/kanban'),
    layer('apps/messages'),
    layer('apps/videos'),
    // Dev tooling — UI sandbox at /kitchen. Comment out for prod builds.
    layer('dev')
  ],

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
    // Foundation modules (migrations, tenant-kernel, email-kernel) are
    // declared inside `layers/core/nuxt.config.ts`.
  ],

  ssr: false,

  devtools: {
    enabled: true
  },

  app: {
    head: {
      title: process.env.APP_TITLE || 'My App'
    }
  },

  ui: {
    theme: {
      colors: ['primary', 'secondary', 'info', 'success', 'warning', 'error', 'neutral']
    }
  },

  runtimeConfig: {
    appName: process.env.APP_TITLE || 'My App',
    databaseUrl: process.env.DATABASE_URL || '',
    appDatabaseUrl: process.env.APP_DATABASE_URL || '',
    jwtSecret: process.env.JWT_SECRET || '',
    mailgunApiKey: process.env.MAILGUN_API_KEY || '',
    mailgunDomain: process.env.MAILGUN_DOMAIN || '',
    mailgunHost: process.env.MAILGUN_HOST || '',
    smtpFrom: process.env.SMTP_FROM || '',
    smtpFromName: process.env.SMTP_FROM_NAME || '',
    s3Endpoint: process.env.S3_ENDPOINT || '',
    s3Region: process.env.S3_REGION || '',
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    s3BucketName: process.env.S3_BUCKET_NAME || '',
    s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL || '',
    mcpServerName: process.env.MCP_SERVER_NAME || 'Apps',
    mcpServerVersion: process.env.MCP_SERVER_VERSION || '1.0.0',
    secretEncryptionKey: process.env.NUXT_SECRET_ENCRYPTION_KEY || '',
    googleClientId: process.env.NUXT_GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.NUXT_GOOGLE_CLIENT_SECRET || '',
    googleOauthRedirectUri: process.env.NUXT_GOOGLE_OAUTH_REDIRECT_URI || '',
    public: {
      appName: process.env.APP_TITLE || 'My App',
      nodeEnv: process.env.NODE_ENV || '',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || ''
    }
  },

  devServer: {
    port: 2080
  },

  compatibilityDate: '2025-01-15',

  hooks: {
    'modules:before': stripLayerTsconfigs
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
