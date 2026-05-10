<template>
  <div class="upload-container">
    <PageHeader title="Upload Video" back-to="/videos" back-text="Back to Library" />

    <main class="upload-main">
      <!-- Upload Complete -->
      <div v-if="uploadProgress.stage === 'complete'" class="upload-complete">
        <div class="success-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="64" height="64">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h2>Upload Complete!</h2>
        <p>Your video has been successfully uploaded and is ready to share.</p>

        <div class="upload-stats" v-if="videoMetadata">
          <div class="stat">
            <span class="stat-label">Original Size:</span>
            <span class="stat-value">{{ formatFileSize(videoMetadata.originalFileSize) }}</span>
          </div>
          <div class="stat" v-if="videoMetadata.compressionRatio">
            <span class="stat-label">Final Size:</span>
            <span class="stat-value">{{ formatFileSize(videoMetadata.fileSize) }}</span>
          </div>
          <div class="stat" v-if="videoMetadata.compressionRatio">
            <span class="stat-label">Compression:</span>
            <span class="stat-value">{{ videoMetadata.compressionRatio.toFixed(1) }}% reduction</span>
          </div>
        </div>

        <div class="complete-actions">
          <NuxtLink :to="`/watch/${shareToken}`" class="btn btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Watch Video
          </NuxtLink>
          <NuxtLink to="/videos" class="btn btn-secondary">
            View Library
          </NuxtLink>
          <button @click="reset" class="btn btn-outline">
            Upload Another
          </button>
        </div>
      </div>

      <!-- Upload Interface -->
      <div v-else class="upload-interface">
        <!-- Error Message -->
        <div v-if="error" class="error-message">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          {{ error }}
        </div>

        <!-- Drop Zone -->
        <div
          v-if="!selectedFile"
          class="drop-zone"
          :class="{ 'drop-zone-active': isDragging }"
          @drop.prevent="handleDrop"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @click="openFilePicker"
        >
          <div class="drop-zone-content">
            <div class="drop-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="64" height="64">
                <path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4M17 8l-5-5-5 5M12 3v12"></path>
              </svg>
            </div>
            <h2>Drag video here</h2>
            <p class="drop-text">or click to browse</p>
            <div class="drop-info">
              <p>Supports: {{ ACCEPTED_FORMATS.join(', ') }}</p>
              <p>Max size: 2GB</p>
            </div>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/avi"
            @change="handleFileSelect"
            style="display: none"
          />
        </div>

        <!-- File Selected / Upload Progress -->
        <div v-else class="upload-progress-container">
          <!-- Video Preview -->
          <div v-if="videoPreviewUrl && !isUploading" class="video-preview">
            <video :src="videoPreviewUrl" controls></video>
          </div>

          <!-- File Info -->
          <div class="file-info">
            <div class="file-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              <div class="file-name">{{ selectedFile.name }}</div>
            </div>

            <div v-if="videoMetadata" class="file-details">
              <div class="detail">
                <span>Duration:</span>
                <strong>{{ formatDuration(videoMetadata.duration) }}</strong>
              </div>
              <div class="detail">
                <span>Size:</span>
                <strong>{{ formatFileSize(selectedFile.size) }}</strong>
              </div>
              <div class="detail">
                <span>Resolution:</span>
                <strong>{{ videoMetadata.width }} × {{ videoMetadata.height }}</strong>
              </div>
            </div>
          </div>

          <!-- Progress Bar -->
          <div v-if="isUploading" class="progress-section">
            <div class="progress-header">
              <span class="progress-message">{{ uploadProgress.message }}</span>
              <span class="progress-percentage">{{ uploadProgress.progress }}%</span>
            </div>
            <div class="progress-bar">
              <div
                class="progress-bar-fill"
                :style="{ width: uploadProgress.progress + '%' }"
                :class="{
                  'progress-compressing': uploadProgress.stage === 'compressing',
                  'progress-uploading': uploadProgress.stage === 'uploading',
                  'progress-complete': uploadProgress.stage === 'complete'
                }"
              ></div>
            </div>
            <div class="progress-stage">
              <span v-if="uploadProgress.stage === 'validating'">Validating file...</span>
              <span v-else-if="uploadProgress.stage === 'compressing'">Optimizing video for web</span>
              <span v-else-if="uploadProgress.stage === 'uploading'">Uploading to cloud</span>
              <span v-else-if="uploadProgress.stage === 'finalizing'">Finalizing...</span>
            </div>

            <!-- Compression Info -->
            <div v-if="uploadProgress.stage === 'compressing' && selectedFile.size >= 50 * 1024 * 1024" class="compression-info">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              Keep this tab open while processing. This will reduce file size by ~90%.
            </div>
          </div>

          <!-- Actions -->
          <div class="upload-actions">
            <button
              v-if="!isUploading"
              @click="uploadVideo"
              class="btn btn-primary btn-large"
              :disabled="!!error"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              Start Upload
            </button>
            <button
              @click="reset"
              class="btn btn-outline"
              :disabled="isUploading && uploadProgress.stage !== 'error'"
            >
              {{ isUploading ? 'Cancel' : 'Choose Different File' }}
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
definePageMeta({
  middleware: 'auth'
})

const {
  selectedFile,
  videoMetadata,
  videoPreviewUrl,
  isUploading,
  error,
  uploadProgress,
  shareToken,
  selectFile,
  uploadVideo,
  reset,
  formatFileSize,
  formatDuration,
  ACCEPTED_FORMATS
} = useVideoUpload()

const isDragging = ref(false)
const fileInput = ref(null)

const openFilePicker = () => {
  fileInput.value?.click()
}

const handleFileSelect = (event) => {
  const file = event.target.files?.[0]
  if (file) {
    selectFile(file)
  }
}

const handleDrop = (event) => {
  isDragging.value = false
  const file = event.dataTransfer.files?.[0]
  if (file) {
    selectFile(file)
  }
}
</script>

<style scoped>
.upload-container {
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
}

.upload-main {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

/* Error Message */
.error-message {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  padding: 1rem;
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Drop Zone */
.drop-zone {
  border: 2px dashed var(--border);
  border-radius: 1rem;
  padding: 4rem 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  background: var(--bg-secondary);
}

.drop-zone:hover,
.drop-zone-active {
  border-color: var(--text);
  background: var(--bg-hover);
  transform: scale(1.02);
}

.drop-zone-content {
  pointer-events: none;
}

.drop-icon {
  margin-bottom: 1.5rem;
  color: var(--text-muted);
}

.drop-zone h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.5rem;
  color: var(--text);
}

.drop-text {
  color: var(--text-muted);
  font-size: 1rem;
  margin-bottom: 1.5rem;
}

.drop-info {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
}

.drop-info p {
  margin: 0.25rem 0;
  color: var(--text-muted);
  font-size: 0.875rem;
}

/* Upload Progress Container */
.upload-progress-container {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 1rem;
  padding: 2rem;
}

/* Video Preview */
.video-preview {
  margin-bottom: 1.5rem;
  border-radius: 0.5rem;
  overflow: hidden;
  background: #000;
}

.video-preview video {
  width: 100%;
  max-height: 400px;
  display: block;
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
  border-bottom: 1px solid var(--border);
}

.file-name {
  font-weight: 500;
  color: var(--text);
  word-break: break-all;
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
  color: var(--text-muted);
}

.detail strong {
  color: var(--text);
}

/* Progress Section */
.progress-section {
  margin-bottom: 1.5rem;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.progress-message {
  color: var(--text);
  font-weight: 500;
}

.progress-percentage {
  color: var(--text-muted);
  font-size: 0.875rem;
}

.progress-bar {
  height: 8px;
  background: var(--bg-hover);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #2563eb);
  transition: width 0.3s ease;
  border-radius: 4px;
}

.progress-compressing {
  background: linear-gradient(90deg, #f59e0b, #d97706);
}

.progress-uploading {
  background: linear-gradient(90deg, #3b82f6, #2563eb);
}

.progress-complete {
  background: linear-gradient(90deg, #10b981, #059669);
}

.progress-stage {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.compression-info {
  margin-top: 1rem;
  padding: 0.75rem;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: #3b82f6;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

/* Upload Actions */
.upload-actions {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

/* Buttons */
.btn {
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: center;
}

.btn-primary {
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0.95));
  color: white;
  border-color: var(--border);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.btn-secondary {
  background: var(--bg);
  color: var(--text);
  border-color: var(--border);
}

.btn-secondary:hover {
  background: var(--bg-hover);
}

.btn-outline {
  background: transparent;
  color: var(--text);
  border-color: var(--border);
}

.btn-outline:hover:not(:disabled) {
  background: var(--bg-hover);
}

.btn-large {
  padding: 1rem 2rem;
  font-size: 1rem;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Upload Complete */
.upload-complete {
  text-align: center;
  padding: 3rem 2rem;
}

.success-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 1.5rem;
  background: rgba(16, 185, 129, 0.1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #10b981;
}

.upload-complete h2 {
  margin: 0 0 0.5rem 0;
  color: var(--text);
  font-size: 2rem;
}

.upload-complete > p {
  color: var(--text-muted);
  margin-bottom: 2rem;
}

.upload-stats {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin: 2rem auto;
  max-width: 500px;
  display: grid;
  gap: 1rem;
}

.stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.stat-value {
  color: var(--text);
  font-weight: 600;
}

.complete-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 2rem;
}

@media (max-width: 768px) {
  .drop-zone {
    padding: 3rem 1rem;
  }

  .upload-progress-container {
    padding: 1.5rem;
  }

  .file-details {
    grid-template-columns: 1fr;
  }

  .upload-actions,
  .complete-actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
  }
}
</style>
