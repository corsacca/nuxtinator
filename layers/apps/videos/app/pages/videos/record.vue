<script setup lang="ts">
import type { RecordingMode } from '../../composables/useScreenRecorder'

definePageMeta({
  middleware: 'auth'
})

const {
  isSupported,
  isRecording,
  isPaused,
  recordedVideoUrl,
  error,
  formattedTime,
  recordingTime,
  recordingSize,
  isUploading,
  uploadProgress,
  shareToken,
  shareableLink,
  recordingMode,
  showWebcam,
  includeAudio,
  countdown,
  isPreparingRecording,
  isPipActive,
  isPositioning,
  webcamStream,
  startRecording,
  finalizeRecording,
  cancelPositioning,
  stopRecording,
  pauseRecording,
  resumeRecording,
  uploadToS3,
  downloadRecording,
  resetRecording,
  recordingFormat
} = useScreenRecorder()

const selectedMode = ref<RecordingMode>('both')

const webcamPermission = ref<'granted' | 'denied' | 'prompt' | 'checking'>('prompt')
const microphonePermission = ref<'granted' | 'denied' | 'prompt' | 'checking'>('prompt')

const requestWebcamPermission = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    webcamPermission.value = 'granted'
    stream.getTracks().forEach(track => track.stop())
  } catch (err: any) {
    webcamPermission.value = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' ? 'denied' : 'prompt'
  }
}

const requestMicrophonePermission = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true })
    microphonePermission.value = 'granted'
    stream.getTracks().forEach(track => track.stop())
  } catch (err: any) {
    microphonePermission.value = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' ? 'denied' : 'prompt'
  }
}

onMounted(async () => {
  if (navigator.permissions) {
    try {
      const cam = await navigator.permissions.query({ name: 'camera' as PermissionName })
      webcamPermission.value = cam.state as 'granted' | 'denied' | 'prompt'
      cam.addEventListener('change', () => {
        webcamPermission.value = cam.state as 'granted' | 'denied' | 'prompt'
      })
    } catch { webcamPermission.value = 'prompt' }
    try {
      const mic = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      microphonePermission.value = mic.state as 'granted' | 'denied' | 'prompt'
      mic.addEventListener('change', () => {
        microphonePermission.value = mic.state as 'granted' | 'denied' | 'prompt'
      })
    } catch { microphonePermission.value = 'prompt' }
  }
})

const handleStartRecording = () => {
  if (selectedMode.value === 'screen' || selectedMode.value === 'both') {
    startRecording(selectedMode.value, 'monitor')
  } else {
    startRecording(selectedMode.value)
  }
}

const handleFinalizeRecording = async () => {
  await finalizeRecording()
}

onUnmounted(() => {
  if (webcamStream.value && !isRecording.value) {
    webcamStream.value.getTracks().forEach(track => track.stop())
  }
})

useHead({ title: 'Record Video' })
</script>

<template>
  <div class="recorder-page">
    <PageHeader title="Record Video" back-to="/videos" back-text="Back to Library">
      <template #actions>
        <UButton to="/videos" variant="outline" size="sm" icon="i-lucide-library">Library</UButton>
      </template>
    </PageHeader>

    <RecorderPermissionWarnings
      :webcam-permission="webcamPermission"
      :microphone-permission="microphonePermission"
      @request-webcam="requestWebcamPermission"
      @request-microphone="requestMicrophonePermission"
    />

    <div class="recorder-container">
      <div v-if="!isSupported" class="error-card">
        <h2>Browser Not Supported</h2>
        <p>Your browser doesn't support screen recording. Please use Chrome, Edge, or Firefox.</p>
      </div>

      <div v-else-if="error" class="error-card">
        <h2>Recording Error</h2>
        <p>{{ error }}</p>
        <UButton @click="error = null" variant="outline">Try Again</UButton>
      </div>

      <div v-else class="recorder-content">
        <RecorderStartRecordingView
          v-if="!isRecording && !recordedVideoUrl && countdown === 0 && !isPreparingRecording && !isPositioning"
          v-model:selected-mode="selectedMode"
          v-model:include-audio="includeAudio"
          @start-recording="handleStartRecording"
        />

        <div v-else-if="isPreparingRecording" class="loading-view">
          <div class="spinner-container"><div class="spinner"></div></div>
          <h2>Preparing Recording...</h2>
          <p class="description">Setting up your streams and getting everything ready</p>
        </div>

        <RecorderCountdownView v-else-if="countdown > 0" :countdown="countdown" />

        <RecorderPositioningView
          v-else-if="isPositioning"
          :is-pip-active="isPipActive"
          @finalize-recording="handleFinalizeRecording"
          @cancel-positioning="cancelPositioning"
        />

        <RecorderRecordingView
          v-else-if="isRecording"
          :formatted-time="formattedTime"
          :recording-mode="recordingMode"
          :show-webcam="showWebcam"
          :webcam-stream="webcamStream"
          :is-paused="isPaused"
          @pause="pauseRecording"
          @resume="resumeRecording"
          @stop="stopRecording"
        />

        <RecorderUploadingView
          v-else-if="isUploading"
          :upload-progress="uploadProgress"
          :recording-duration="recordingTime"
          :recording-size="recordingSize"
          :recording-format="recordingFormat"
        />

        <RecorderShareView
          v-else-if="shareableLink"
          :shareable-link="shareableLink"
          :share-token="shareToken"
          @reset-recording="resetRecording"
        />

        <RecorderPreviewView
          v-else-if="recordedVideoUrl"
          :recorded-video-url="recordedVideoUrl"
          @upload="uploadToS3"
          @download="downloadRecording"
          @reset="resetRecording"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.recorder-page {
  min-height: 100%;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.recorder-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 3rem 2rem;
}

.recorder-content { text-align: center; }

.error-card {
  background: var(--ui-bg-elevated);
  border: 2px solid #dc2626;
  border-radius: 0.5rem;
  padding: 2rem;
  text-align: center;
}

.error-card h2 { color: #dc2626; margin-bottom: 1rem; }
.error-card p { color: var(--ui-text-muted); margin-bottom: 1.5rem; }

.loading-view { padding: 4rem 2rem; text-align: center; }
.loading-view h2 { font-size: 2rem; margin-bottom: 1rem; font-weight: 600; }

.description {
  font-size: 1.1rem;
  color: var(--ui-text-muted);
  margin-bottom: 2rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.spinner-container { margin-bottom: 2rem; display: flex; justify-content: center; align-items: center; }

.spinner {
  width: 60px;
  height: 60px;
  border: 4px solid var(--ui-border);
  border-top-color: var(--ui-text);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .recorder-container { padding: 2rem 1rem; }
}
</style>
