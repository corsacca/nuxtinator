import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

declare const process: { env: Record<string, string | undefined> }

const LAYERS_DIR = '_layers'

// Layers extracted from a full Nuxt project ship a tsconfig.json that
// references generated paths Vite's tsconfig walker can crash on. Strip
// them defensively before module loading.
function stripLayerTsconfigs() {
  if (!existsSync(LAYERS_DIR)) return
  for (const name of readdirSync(LAYERS_DIR)) {
    const t = join(LAYERS_DIR, name, 'tsconfig.json')
    if (existsSync(t)) rmSync(t)
  }
}
stripLayerTsconfigs()

// Resolve each layer by package name. Per-layer local override via env var:
// set NUXTINATOR_<ID>_PATH=../../sibling-checkout to point one layer at a
// local working copy without touching package.json (id uppercased; hyphens
// and slashes become underscores). Without an override, the package name
// resolves through node_modules/@nuxtinator/<id>/ (the bun workspace symlink
// created from _layers/<id>/).
function layer(pkg: string): string {
  const envKey = pkg.replace(/^@/, '').replace(/[/-]/g, '_').toUpperCase() + '_PATH'
  return process.env[envKey] || pkg
}

// https://nuxt.com/docs/api/configuration/nuxt-config
//
// This is the project's host shell. Trim the `extends:` array to only the
// layers your project actually uses (matching the `LAYERS` map in
// scripts/sync-layers.ts). Load order matters: core first; tenancy second
// so its multi-mode kernel overrides core's single-mode; email backend;
// oauth; mcp; app layers; dev last.
export default defineNuxtConfig({

  extends: [
    layer('@nuxtinator/core'),
    layer('@nuxtinator/tenancy'),         // comment out (or remove) for single-tenant
    layer('@nuxtinator/email-mailgun'),   // pick at most one email backend (or omit)
    layer('@nuxtinator/oauth'),
    layer('@nuxtinator/mcp'),
    layer('@nuxtinator/calendar'),
    layer('@nuxtinator/feedback'),
    layer('@nuxtinator/kanban'),
    layer('@nuxtinator/list-of-100'),
    layer('@nuxtinator/messages'),
    layer('@nuxtinator/videos'),
    layer('@nuxtinator/dev')              // remove before production build
  ],

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
    // Foundation modules (migrations, tenant-kernel, email-kernel) are
    // declared inside @nuxtinator/core itself.
  ],

  hooks: { 'modules:before': stripLayerTsconfigs },

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
    mcpServerName: process.env.MCP_SERVER_NAME || 'My App',
    mcpServerVersion: process.env.MCP_SERVER_VERSION || '1.0.0',
    secretEncryptionKey: process.env.NUXT_SECRET_ENCRYPTION_KEY || '',
    googleClientId: process.env.NUXT_GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.NUXT_GOOGLE_CLIENT_SECRET || '',
    googleOauthRedirectUri: process.env.NUXT_GOOGLE_OAUTH_REDIRECT_URI || '',
    public: {
      appName: process.env.APP_TITLE || 'My App',
      nodeEnv: process.env.NODE_ENV || '',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || '',
      feedbackProjectId: process.env.NUXT_PUBLIC_FEEDBACK_PROJECT_ID || ''
    }
  },

  devServer: {
    port: 2080
  },

  // Each _layers/<id>/ is a workspace member. Under hoisted linker (bunfig.toml),
  // layer deps mostly live at root node_modules/.bun/, but per-member symlink
  // dirs can still trip Vite's recursive watcher on macOS at scale. Belt-and-suspenders:
  vite: {
    server: {
      watch: {
        ignored: ['**/_layers/*/node_modules/**', '**/node_modules/**']
      }
    }
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
