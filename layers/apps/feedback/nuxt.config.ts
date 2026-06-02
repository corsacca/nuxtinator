export default defineNuxtConfig({
  vue: {
    compilerOptions: {
      isCustomElement: (tag: string) => tag === 'feedback-web-component'
    }
  },

  // This layer owns its own config — the host no longer declares this.
  runtimeConfig: {
    public: {
      feedbackProjectId: process.env.NUXT_PUBLIC_FEEDBACK_PROJECT_ID || process.env.FEEDBACK_PROJECT_ID || ''
    }
  }
})
