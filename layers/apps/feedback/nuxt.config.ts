export default defineNuxtConfig({
  vue: {
    compilerOptions: {
      isCustomElement: (tag: string) => tag === 'feedback-web-component'
    }
  }
})
