<template>
  <header class="page-header">
    <div class="header-content">
      <div class="header-top">
        <NuxtLink :to="backTo" class="back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          {{ backText }}
        </NuxtLink>
        <div class="header-actions">
          <slot name="actions"></slot>
        </div>
      </div>
      <h1>{{ title }}</h1>
    </div>
  </header>
</template>

<script setup lang="ts">
interface Props {
  title: string
  backTo?: string
  backText?: string
}

withDefaults(defineProps<Props>(), {
  backTo: '/videos',
  backText: 'Back to Library'
})
</script>

<style scoped>
.page-header {
  background: var(--ui-bg-elevated);
  border-bottom: 1px solid var(--ui-border);
  padding: 1rem 0;
}

.header-content {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 1rem;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--ui-text-muted);
  text-decoration: none;
  font-size: 0.9rem;
  transition: color 0.2s;
}

.back-link:hover {
  color: var(--ui-text);
}

.header-content h1 {
  margin: 0;
  color: var(--ui-text);
}
</style>
