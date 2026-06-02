import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { fileURLToPath, URL } from 'node:url'

// Build output: the feedback LAYER's own public/js/ folder. Nuxt serves every
// extended layer's public/ at the site root, so this committed bundle is served
// at /js/feedback-web-component.iife.js by ANY host that loads the layer — the
// monorepo dev host AND every scaffolded consumer app — with no host-side build
// step. The bundle ships with the layer via sync-layers; rebuild it with
// `bun run build:widgets` (from the layer root) whenever the widget source changes.
//
// Path:  layers/apps/feedback/embeddables/feedback-web-component/vite.config.js
//        → ../../public/js   (= layers/apps/feedback/public/js)
const PUBLIC_JS_DIR = fileURLToPath(new URL('../../public/js', import.meta.url))

export default defineConfig({
  plugins: [
    vue({
      customElement: true,
      template: {
        compilerOptions: {
          isCustomElement: tag => tag === 'feedback-web-component'
        }
      }
    })
  ],

  define: {
    'process.env': {},
    'process.env.NODE_ENV': JSON.stringify('production')
  },

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },

  build: {
    outDir: PUBLIC_JS_DIR,
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/entry.js'),
      name: 'FeedbackWebComponent',
      fileName: 'feedback-web-component',
      formats: ['iife']
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    },
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: true
      }
    }
  },

  server: {
    port: 5174,
    host: true,
    open: false
  }
})
