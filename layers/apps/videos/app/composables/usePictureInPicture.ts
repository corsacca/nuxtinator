export const usePictureInPicture = () => {
  const isPipActive = ref(false)
  let pipVideoElement: HTMLVideoElement | null = null

  // Open Picture-in-Picture with a video stream
  const openPip = async (stream: MediaStream): Promise<boolean> => {
    try {
      pipVideoElement = document.createElement('video')
      pipVideoElement.srcObject = stream
      pipVideoElement.muted = true
      pipVideoElement.playsInline = true

      await pipVideoElement.play()

      if (document.pictureInPictureEnabled && pipVideoElement.requestPictureInPicture) {
        await pipVideoElement.requestPictureInPicture()
        isPipActive.value = true

        pipVideoElement.addEventListener('leavepictureinpicture', () => {
          isPipActive.value = false
        })

        return true
      }

      return false
    } catch (pipError) {
      console.warn('Picture-in-Picture not available:', pipError)
      return false
    }
  }

  // Close Picture-in-Picture
  const closePip = () => {
    if (pipVideoElement) {
      if (document.pictureInPictureElement === pipVideoElement) {
        document.exitPictureInPicture().catch(err => console.log('PiP exit error:', err))
      }
      pipVideoElement.srcObject = null
      pipVideoElement = null
      isPipActive.value = false
    }
  }

  // Cleanup on unmount
  onUnmounted(() => {
    closePip()
  })

  return {
    isPipActive: readonly(isPipActive),
    openPip,
    closePip,
  }
}
