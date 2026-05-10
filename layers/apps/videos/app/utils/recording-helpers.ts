// Helper function to play countdown beep sounds
export const playCountdownBeep = (countdownValue: number) => {
  try {
    const audioContext = new AudioContext()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    // Different frequencies for different countdown numbers
    // 3 and 2 = same pitch, 1 = higher pitch
    if (countdownValue === 3 || countdownValue === 2) {
      oscillator.frequency.value = 600
    } else if (countdownValue === 1) {
      oscillator.frequency.value = 700
    }

    oscillator.type = 'sine'
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.2)

    // Clean up
    setTimeout(() => {
      audioContext.close()
    }, 300)
  } catch (err) {
    console.error('Failed to play countdown beep:', err)
  }
}

// Generate thumbnail from video
export const generateThumbnail = async (videoUrl: string): Promise<Blob | null> => {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video')
      video.crossOrigin = 'anonymous'
      video.src = videoUrl
      video.currentTime = 1 // Capture frame at 1 second

      video.addEventListener('loadeddata', () => {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight

        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          canvas.toBlob((blob) => {
            resolve(blob)
          }, 'image/jpeg', 0.8)
        } else {
          resolve(null)
        }
      })

      video.addEventListener('error', () => {
        resolve(null)
      })
    } catch (err) {
      console.error('Error generating thumbnail:', err)
      resolve(null)
    }
  })
}

// Get webcam size pixels (always medium = 25%)
export const getWebcamDimensions = (canvasWidth: number, canvasHeight: number) => {
  return { width: canvasWidth * 0.25, height: canvasHeight * 0.25 }
}

// Get webcam position coordinates (always bottom-right)
export const getWebcamPosition = (canvasWidth: number, canvasHeight: number, webcamWidth: number, webcamHeight: number) => {
  const padding = 20
  return { x: canvasWidth - webcamWidth - padding, y: canvasHeight - webcamHeight - padding }
}
