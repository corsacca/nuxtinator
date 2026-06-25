<template>
  <div class="mic-meter">
    <canvas ref="canvas" class="mic-meter-canvas" />
    <span v-if="error" class="mic-meter-error">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
// Live microphone level meter. While `active`, it opens a preview stream for the
// chosen device, feeds it through an AnalyserNode, and paints a waveform so the
// user can see that audio is being picked up before they start recording.
const props = defineProps<{
  deviceId: string | null
  active: boolean
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const error = ref<string | null>(null)

let stream: MediaStream | null = null
let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let source: MediaStreamAudioSourceNode | null = null
let dataArray: Uint8Array<ArrayBuffer> | null = null
let rafId: number | null = null
let strokeColor = ''

const stop = () => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  source?.disconnect()
  source = null
  analyser = null
  dataArray = null
  stream?.getTracks().forEach(track => track.stop())
  stream = null
  audioContext?.close()
  audioContext = null

  const c = canvas.value
  const ctx = c?.getContext('2d')
  if (c && ctx) ctx.clearRect(0, 0, c.width, c.height)
}

const draw = () => {
  rafId = requestAnimationFrame(draw)

  const c = canvas.value
  const ctx = c?.getContext('2d')
  if (!c || !ctx || !analyser || !dataArray) return

  analyser.getByteTimeDomainData(dataArray)

  // Keep the backing store matched to the displayed size for crisp lines.
  const dpr = window.devicePixelRatio || 1
  const width = c.clientWidth
  const height = c.clientHeight
  if (c.width !== Math.round(width * dpr) || c.height !== Math.round(height * dpr)) {
    c.width = Math.round(width * dpr)
    c.height = Math.round(height * dpr)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  // Loudness (RMS) drives opacity so silence reads as a faint flat line.
  let sum = 0
  for (let i = 0; i < dataArray.length; i++) {
    const v = ((dataArray[i] ?? 128) - 128) / 128
    sum += v * v
  }
  const rms = Math.sqrt(sum / dataArray.length)

  if (!strokeColor) {
    strokeColor = getComputedStyle(c).getPropertyValue('--ui-primary').trim() || '#22c55e'
  }

  ctx.lineWidth = 2
  ctx.strokeStyle = strokeColor
  ctx.globalAlpha = Math.min(1, 0.3 + rms * 6)
  ctx.beginPath()
  const sliceWidth = width / dataArray.length
  let x = 0
  for (let i = 0; i < dataArray.length; i++) {
    const y = ((dataArray[i] ?? 128) / 255) * height
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
    x += sliceWidth
  }
  ctx.stroke()
}

const start = async () => {
  stop()
  error.value = null
  try {
    const audio: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }
    if (props.deviceId) audio.deviceId = { exact: props.deviceId }

    stream = await navigator.mediaDevices.getUserMedia({ audio, video: false })
    audioContext = new AudioContext()
    await audioContext.resume()
    source = audioContext.createMediaStreamSource(stream)
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    dataArray = new Uint8Array(analyser.fftSize)
    rafId = requestAnimationFrame(draw)
  } catch (err) {
    error.value = 'Microphone unavailable'
    console.error('Mic meter error:', err)
  }
}

watch(
  () => [props.active, props.deviceId] as const,
  () => {
    if (props.active) start()
    else stop()
  },
  { immediate: true }
)

onUnmounted(stop)
</script>

<style scoped>
.mic-meter {
  width: 100%;
  height: 40px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 0.375rem;
  overflow: hidden;
  position: relative;
}

.mic-meter-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.mic-meter-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  color: var(--ui-text-muted);
}
</style>
