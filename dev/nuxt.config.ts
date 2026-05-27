import { LAYERS } from './layers'

declare const process: { env: Record<string, string | undefined> }

// Resolve where each layer comes from. By default, `extends:` uses the layer's
// package name (`@nuxtinator/<id>`), which resolves via standard node module
// resolution against `node_modules/` — workspace symlink in this monorepo.
//
// Per-layer local override: set `NUXTINATOR_<ID>_PATH` (id uppercased, hyphens
// and slashes become underscores) to point an individual layer at a sibling
// checkout on disk. e.g. `NUXTINATOR_MESSAGES_PATH=../../scratch/messages`.
function layer(pkg: string): string {
  const envKey = pkg.replace(/^@/, '').replace(/[/-]/g, '_').toUpperCase() + '_PATH'
  return process.env[envKey] || pkg
}

// https://nuxt.com/docs/api/configuration/nuxt-config
//
// This is the host shell. Layer selection lives in ./layers.ts — this file
// just consumes it. The `extends:` array is derived from LAYERS in order, so
// reordering or trimming is done by editing layers.ts (and the matching
// workspace:* dep block in package.json).
export default defineNuxtConfig({

  extends: LAYERS.map(l => layer(l.pkg)),

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
    public: {
      appName: process.env.APP_TITLE || 'My App',
      nodeEnv: process.env.NODE_ENV || '',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || '',
      feedbackProjectId: process.env.NUXT_PUBLIC_FEEDBACK_PROJECT_ID || process.env.FEEDBACK_PROJECT_ID || ''
    }
  },

  devServer: {
    port: 2080
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
