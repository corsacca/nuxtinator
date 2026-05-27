import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { fileURLToPath, URL } from 'node:url'

// Primary build output: the host Nuxt app's public/js/ folder (CDN-ready IIFE),
// served at: http://localhost:2080/js/feedback-web-component.iife.js
//
// Path:  layers/apps/feedback/embeddables/feedback-web-component/vite.config.js
//        → ../../../../../dev/public/js
const PUBLIC_JS_DIR = fileURLToPath(new URL('../../../../../dev/public/js', import.meta.url))

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
