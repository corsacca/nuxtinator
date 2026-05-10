<template>
  <div v-if="webcamPermission !== 'granted' || microphonePermission !== 'granted'" class="permissions-warnings">
    <div v-if="webcamPermission !== 'granted'" class="permission-warning webcam-warning">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      <div class="warning-content">
        <h3>Webcam Access</h3>
        <p>{{ webcamPermission === 'denied' ? 'Please enable webcam access in your browser settings to record with your camera.' : 'Click the button to grant webcam access for recording.' }}</p>
      </div>
      <UButton @click="$emit('request-webcam')" variant="outline" color="error">
        Enable Webcam
      </UButton>
    </div>

    <div v-if="microphonePermission !== 'granted'" class="permission-warning microphone-warning">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      <div class="warning-content">
        <h3>Microphone Access</h3>
        <p>{{ microphonePermission === 'denied' ? 'Please enable microphone access in your browser settings to record audio.' : 'Click the button to grant microphone access for recording.' }}</p>
      </div>
      <UButton @click="$emit('request-microphone')" variant="outline" color="error">
        Enable Microphone
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  webcamPermission: 'granted' | 'denied' | 'prompt' | 'checking'
  microphonePermission: 'granted' | 'denied' | 'prompt' | 'checking'
}>()

defineEmits<{
  'request-webcam': []
  'request-microphone': []
}>()
</script>

<style scoped>
.permissions-warnings {
  max-width: 900px;
  margin: 0 auto;
  padding: 1rem 2rem 0;
}

.permission-warning {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem;
  margin-bottom: 1rem;
  background: rgba(220, 38, 38, 0.1);
  border: 2px solid #dc2626;
  border-radius: 0.5rem;
  color: #dc2626;
}

.permission-warning svg {
  flex-shrink: 0;
}

.warning-content {
  flex: 1;
}

.warning-content h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
}

.warning-content p {
  font-size: 0.95rem;
  margin: 0;
  opacity: 0.9;
}

.permission-warning :deep(button) {
  flex-shrink: 0;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .permissions-warnings {
    padding: 1rem 1rem 0;
  }

  .permission-warning {
    flex-wrap: wrap;
    padding: 1rem;
    gap: 0.75rem;
  }

  .permission-warning svg {
    width: 20px;
    height: 20px;
  }

  .warning-content h3 {
    font-size: 1rem;
  }

  .warning-content p {
    font-size: 0.875rem;
  }

  .permission-warning :deep(button) {
    width: 100%;
  }
}
</style>
