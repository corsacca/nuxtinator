<template>
  <div class="countdown-view">
    <div class="countdown-number">{{ countdown }}</div>
    <p class="countdown-text">Get ready...</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  countdown: number
}>()
</script>

<style scoped>
.countdown-view {
  padding: 4rem 2rem;
  text-align: center;
}

.countdown-number {
  font-size: 8rem;
  font-weight: 700;
  color: var(--ui-text);
  animation: countdownPulse 1s ease-in-out;
  line-height: 1;
}

@keyframes countdownPulse {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.countdown-text {
  font-size: 1.5rem;
  color: var(--ui-text-muted);
  margin-top: 2rem;
}
</style>
