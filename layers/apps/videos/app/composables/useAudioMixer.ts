export const useAudioMixer = () => {
  let audioMixerContext: AudioContext | null = null

  // Mix multiple audio sources using Web Audio API
  const mixAudioSources = (audioSources: MediaStream[]): MediaStreamTrack | null => {
    if (audioSources.length === 0) {
      return null
    }

    if (audioSources.length === 1) {
      // Only one audio source, use it directly
      return audioSources[0]?.getAudioTracks()[0] ?? null
    }

    // Multiple audio sources - mix them
    try {
      audioMixerContext = new AudioContext()
      const destination = audioMixerContext.createMediaStreamDestination()

      // Connect all audio sources to the destination
      audioSources.forEach(source => {
        const audioSource = audioMixerContext!.createMediaStreamSource(source)
        audioSource.connect(destination)
      })

      return destination.stream.getAudioTracks()[0] ?? null
    } catch (err) {
      console.error('Failed to mix audio tracks:', err)
      // Fallback to first audio track only
      return audioSources[0]?.getAudioTracks()[0] ?? null
    }
  }

  // Cleanup audio mixer context
  const cleanup = () => {
    if (audioMixerContext) {
      audioMixerContext.close()
      audioMixerContext = null
    }
  }

  return {
    mixAudioSources,
    cleanup,
  }
}
