<template>
  <div class="start-recording-view">
    <div class="icon-container">
      <svg class="record-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="2" width="20" height="20" rx="2" ry="2"></rect>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    </div>
    <h2>Create a Recording</h2>
    <p class="description">
      Choose what you want to record
    </p>

    <!-- Mode Selection -->
    <div class="mode-selection">
      <UButton
        @click="handleModeSelection('both')"
        :variant="selectedMode === 'both' ? 'solid' : 'outline'"
        size="xl"
        block
        class="mode-btn"
      >
        <template #leading>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
            <polyline points="23 7 16 12 23 17"></polyline>
          </svg>
        </template>
        Screen + Webcam
      </UButton>
      <UButton
        @click="handleModeSelection('screen')"
        :variant="selectedMode === 'screen' ? 'solid' : 'outline'"
        size="xl"
        block
        class="mode-btn"
      >
        <template #leading>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
        </template>
        Screen Only
      </UButton>
      <UButton
        @click="handleModeSelection('webcam')"
        :variant="selectedMode === 'webcam' ? 'solid' : 'outline'"
        size="xl"
        block
        class="mode-btn"
      >
        <template #leading>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="4"></circle>
          </svg>
        </template>
        Webcam Only
      </UButton>
    </div>

    <!-- Audio Settings -->
    <div class="recording-settings">
      <UCheckbox
        :model-value="includeAudio"
        @update:model-value="(v: boolean | 'indeterminate') => $emit('update:includeAudio', v === true)"
        name="includeAudio"
        label="Include Microphone Audio"
      >
        <template #label>
          <div class="checkbox-label-content">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
            <span class="checkbox-label-text">Include Microphone Audio</span>
          </div>
        </template>
      </UCheckbox>
    </div>

    <UButton @click="$emit('start-recording')" size="xl" class="mt-4">
      <template #leading>
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
      </template>
      Start Recording
    </UButton>
    <p class="hint">
      <span v-if="selectedMode === 'screen'">Record your entire screen, a specific window, or just a browser tab.</span>
      <span v-else-if="selectedMode === 'webcam'">Record yourself using your webcam with audio.</span>
      <span v-else>Record your screen with your webcam overlay in the bottom-right corner.</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { RecordingMode } from '../../composables/useScreenRecorder'

const props = defineProps<{
  selectedMode: RecordingMode
  includeAudio: boolean
}>()

const emit = defineEmits<{
  'update:selectedMode': [mode: RecordingMode]
  'update:includeAudio': [value: boolean]
  'start-recording': []
}>()

const handleModeSelection = (mode: RecordingMode) => {
  // If the same mode is already selected, start recording
  if (props.selectedMode === mode) {
    emit('start-recording')
  } else {
    // Otherwise, just select the mode
    emit('update:selectedMode', mode)
  }
}
</script>

<style scoped>
.start-recording-view {
  padding: 2rem;
  text-align: center;
}

.icon-container {
  margin-bottom: 2rem;
}

.record-icon {
  width: 80px;
  height: 80px;
  color: var(--ui-text);
  opacity: 0.7;
  margin: 0 auto;
}

.start-recording-view h2 {
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

.hint {
  font-size: 0.9rem;
  color: var(--ui-text-muted);
  margin-top: 1rem;
}

.mode-selection {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin: 2rem auto;
  max-width: 700px;
}

.recording-settings {
  max-width: 600px;
  margin: 2rem auto;
  padding: 1.5rem;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.recording-settings :deep(> div) {
  align-items: center !important;
}

.recording-settings :deep(label) {
  display: flex;
  align-items: center;
  gap: 1rem;
  cursor: pointer;
  font-size: 1rem;
}

.recording-settings :deep(input[type="checkbox"]) {
  margin-top: 0;
  flex-shrink: 0;
}

.checkbox-label-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1rem;
  font-weight: 500;
  color: var(--ui-text);
  line-height: 1;
}

.checkbox-label-content svg {
  flex-shrink: 0;
  display: block;
}

.checkbox-label-text {
  user-select: none;
  line-height: 1.5;
}

@media (max-width: 640px) {
  .start-recording-view h2 {
    font-size: 1.5rem;
  }

  .mode-selection {
    grid-template-columns: 1fr;
  }

  .recording-settings {
    padding: 1rem;
  }

  .recording-settings :deep(label) {
    font-size: 0.95rem;
  }

  .checkbox-label-content {
    font-size: 0.95rem;
  }

  .checkbox-label-content svg {
    width: 16px;
    height: 16px;
  }
}
</style>
