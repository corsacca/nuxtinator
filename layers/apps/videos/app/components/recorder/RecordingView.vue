<template>
  <div class="recording-view">
    <div class="recording-indicator">
      <div class="recording-pulse"></div>
      <span class="recording-text">RECORDING</span>
    </div>

    <div class="recording-time">{{ formattedTime }}</div>

    <p class="recording-message">
      <span v-if="recordingMode === 'screen'">Your screen is being recorded.</span>
      <span v-else-if="recordingMode === 'webcam'">Your webcam is being recorded.</span>
      <span v-else>Your screen and webcam are being recorded.</span>
    </p>

    <!-- Webcam Preview (only for webcam-only mode) -->
    <div
      v-if="recordingMode === 'webcam' && showWebcam && webcamStream"
      class="webcam-preview-container"
    >
      <video
        ref="webcamVideoRef"
        autoplay
        muted
        playsinline
        class="webcam-preview position-bottom-right size-medium"
      ></video>
    </div>

    <div class="recording-controls">
      <UButton @click="isPaused ? $emit('resume') : $emit('pause')" size="xl" variant="outline">
        <template #leading>
          <svg v-if="isPaused" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>
        </template>
        {{ isPaused ? 'Resume' : 'Pause' }}
      </UButton>
      <UButton @click="$emit('stop')" color="error" size="xl">
        <template #leading>
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <rect x="6" y="6" width="12" height="12"></rect>
          </svg>
        </template>
        Stop Recording
      </UButton>
    </div>

    <p class="hint">
      You can also stop recording by clicking "Stop sharing" in your browser's sharing indicator.
    </p>
  </div>
</template>

<script setup lang="ts">
import type { RecordingMode } from '../../composables/useScreenRecorder'

const props = defineProps<{
  formattedTime: string
  recordingMode: RecordingMode
  showWebcam: boolean
  webcamStream: MediaStream | null
  isPaused: boolean
}>()

defineEmits<{
  pause: []
  resume: []
  stop: []
}>()

const webcamVideoRef = ref<HTMLVideoElement | null>(null)

// Setup webcam video element when stream is available
watchEffect(() => {
  if (props.webcamStream && webcamVideoRef.value && !webcamVideoRef.value.srcObject) {
    webcamVideoRef.value.srcObject = props.webcamStream
    webcamVideoRef.value.play().catch(err => {
      console.error('Error playing webcam video:', err)
    })
  }
})
</script>

<style scoped>
.recording-view {
  padding: 2rem;
  text-align: center;
}

.recording-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.recording-pulse {
  width: 12px;
  height: 12px;
  background: #dc2626;
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.2);
  }
}

.recording-text {
  font-weight: 600;
  font-size: 1rem;
  color: #dc2626;
  letter-spacing: 0.05em;
}

.recording-time {
  font-size: 3rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-bottom: 1.5rem;
}

.recording-message {
  font-size: 1.1rem;
  color: var(--ui-text-muted);
  margin-bottom: 2rem;
}

.recording-controls {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.hint {
  font-size: 0.9rem;
  color: var(--ui-text-muted);
  margin-top: 1rem;
}

.webcam-preview-container {
  position: relative;
  max-width: 800px;
  margin: 2rem auto;
  aspect-ratio: 16 / 9;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  overflow: visible;
}

.webcam-preview {
  position: absolute;
  border-radius: 0.5rem;
  border: 3px solid var(--ui-bg-elevated);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  object-fit: cover;
  background: #000;
  z-index: 10;
  transform: scaleX(-1);
}

.webcam-preview.position-bottom-right {
  bottom: 20px;
  right: 20px;
}

.webcam-preview.size-medium {
  width: 25%;
  aspect-ratio: 4 / 3;
}

@media (max-width: 640px) {
  .recording-time {
    font-size: 2.5rem;
  }

  .webcam-preview.size-medium {
    width: 35%;
  }

  .webcam-preview.position-bottom-right {
    bottom: 10px;
    right: 10px;
  }
}
</style>
