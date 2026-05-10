<template>
  <div class="uploading-view">
    <h2>Uploading Your Recording...</h2>
    <p class="description">
      Please wait while we save your recording to the cloud.
    </p>

    <div class="upload-container">
      <!-- File Info -->
      <div class="file-info">
        <div class="file-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <div class="file-name">recording-{{ Date.now() }}.{{ fileExtension }}</div>
        </div>

        <div class="file-details">
          <div class="detail">
            <span>Duration:</span>
            <strong>{{ formatDuration(recordingDuration) }}</strong>
          </div>
          <div class="detail">
            <span>Size:</span>
            <strong>{{ formatFileSize(recordingSize) }}</strong>
          </div>
          <div class="detail">
            <span>Format:</span>
            <strong>{{ formatLabel }}</strong>
          </div>
        </div>
      </div>

      <!-- Progress Section -->
      <div class="progress-section">
        <div class="progress-header">
          <span class="progress-message">{{ uploadProgress.message }}</span>
          <span class="progress-percentage">{{ uploadProgress.progress }}%</span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-bar-fill"
            :style="{ width: uploadProgress.progress + '%' }"
          ></div>
        </div>
        <div class="progress-stage">
          <span v-if="uploadProgress.stage === 'uploading'">Uploading to cloud</span>
          <span v-else-if="uploadProgress.stage === 'finalizing'">Finalizing...</span>
          <span v-else-if="uploadProgress.stage === 'complete'">Upload complete!</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface UploadProgress {
  stage: 'validating' | 'compressing' | 'uploading' | 'finalizing' | 'complete' | 'error'
  progress: number
  message: string
  estimatedTimeRemaining?: number
}

const props = defineProps<{
  uploadProgress: UploadProgress
  recordingDuration: number
  recordingSize: number
  recordingFormat?: { mimeType: string; isMP4: boolean } | null
}>()

const fileExtension = computed(() => {
  if (!props.recordingFormat) return 'mp4'
  return props.recordingFormat.isMP4 ? 'mp4' : 'webm'
})
const formatLabel = computed(() => fileExtension.value.toUpperCase())

// Format file size
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

// Format duration
const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.uploading-view {
  padding: 2rem;
  max-width: 700px;
  margin: 0 auto;
}

.uploading-view h2 {
  font-size: 2rem;
  margin-bottom: 1rem;
  font-weight: 600;
  text-align: center;
}

.description {
  font-size: 1.1rem;
  color: var(--ui-text-muted);
  margin-bottom: 2rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
  text-align: center;
}

/* Upload Container */
.upload-container {
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 1rem;
  padding: 2rem;
}

/* File Info */
.file-info {
  margin-bottom: 1.5rem;
}

.file-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--ui-border);
}

.file-name {
  font-weight: 500;
  color: var(--ui-text);
  word-break: break-all;
  font-size: 0.95rem;
}

.file-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.detail {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.detail span {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
}

.detail strong {
  color: var(--ui-text);
  font-size: 0.95rem;
}

/* Progress Section */
.progress-section {
  padding-top: 1.5rem;
  border-top: 1px solid var(--ui-border);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.progress-message {
  color: var(--ui-text);
  font-weight: 500;
  font-size: 1rem;
}

.progress-percentage {
  color: var(--ui-text-muted);
  font-size: 1.25rem;
  font-weight: 600;
}

.progress-bar {
  height: 10px;
  background: var(--ui-bg);
  border-radius: 5px;
  overflow: hidden;
  margin-bottom: 0.75rem;
}

.progress-bar-fill {
  height: 100%;
  background: var(--ui-text);
  transition: width 0.3s ease;
  border-radius: 5px;
}

.progress-stage {
  font-size: 0.9rem;
  color: var(--ui-text-muted);
  text-align: center;
}

@media (max-width: 640px) {
  .uploading-view {
    padding: 1.5rem;
  }

  .upload-container {
    padding: 1.5rem;
  }

  .file-details {
    grid-template-columns: 1fr;
  }
}
</style>
