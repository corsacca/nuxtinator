<template>
  <div class="positioning-view">
    <div class="step-indicator">
      <div class="step-number">Step 2: Position Webcam</div>
    </div>

    <h2>Position Your Webcam</h2>
    <p class="description">
      <span v-if="isPipActive">
        A Picture-in-Picture window is now showing your webcam. Drag it to your desired location on the screen, then click "Start Recording" below.
      </span>
      <span v-else>
        Your webcam is ready. Position it where you want it to appear in the final recording.
      </span>
    </p>

    <div class="positioning-instructions">
      <div class="instruction-card">
        <div class="instruction-icon">1</div>
        <div class="instruction-text">
          <strong>Drag the PiP window (your webcam)</strong> to your desired screen
        </div>
      </div>
      <div class="instruction-card">
        <div class="instruction-icon">2</div>
        <div class="instruction-text">
          <strong>Resize if needed</strong> using the browser's PiP controls
        </div>
      </div>
      <div class="instruction-card">
        <div class="instruction-icon">3</div>
        <div class="instruction-text">
          <strong>Click "Start Recording"</strong> when you're ready
        </div>
      </div>
    </div>

    <div v-if="isPipActive" class="pip-notice">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      The webcam window will be visible in your final recording wherever you position it.
    </div>

    <div class="action-buttons">
      <UButton @click="$emit('finalize-recording')" size="xl" color="success">
        <template #leading>
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <circle cx="12" cy="12" r="10"></circle>
          </svg>
        </template>
        Start Recording
      </UButton>
      <UButton @click="$emit('cancel-positioning')" size="xl" variant="outline">
        <template #leading>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </template>
        Cancel
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  isPipActive: boolean
}>()

defineEmits<{
  'finalize-recording': []
  'cancel-positioning': []
}>()
</script>

<style scoped>
.positioning-view {
  padding: 2rem;
  text-align: center;
}

.positioning-view h2 {
  font-size: 2rem;
  margin-bottom: 1rem;
  font-weight: 600;
}

.description {
  font-size: 1.1rem;
  color: var(--ui-text-muted);
  margin-bottom: 2rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.step-indicator {
  margin-bottom: 1.5rem;
}

.step-number {
  display: inline-block;
  padding: 0.5rem 1.5rem;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 2rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--ui-text-muted);
}

.positioning-instructions {
  max-width: 600px;
  margin: 2rem auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.instruction-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  text-align: left;
}

.instruction-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  background: rgba(59, 130, 246, 0.1);
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 700;
  color: rgb(59, 130, 246);
}

.instruction-text {
  flex: 1;
  font-size: 0.95rem;
  color: var(--ui-text);
}

.instruction-text strong {
  font-weight: 600;
  color: var(--ui-text);
}

.pip-notice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  margin: 1rem auto;
  max-width: 600px;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 0.5rem;
  color: rgb(34, 197, 94);
  font-size: 0.9rem;
}

.pip-notice svg {
  flex-shrink: 0;
}

.action-buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

.action-buttons :deep(button),
.action-buttons :deep(a) {
  margin: 0 !important;
}
</style>
