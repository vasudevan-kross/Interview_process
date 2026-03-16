/**
 * MediaDevices Utility Functions
 * Handles microphone permission, detection, and error classification
 */

export interface AudioDevice {
  deviceId: string
  label: string
  groupId: string
}

export type MicrophoneErrorType =
  | 'not_allowed'        // Permission denied
  | 'not_found'          // No microphone detected
  | 'not_readable'       // Microphone in use by another app
  | 'unsupported'        // Browser doesn't support MediaDevices API
  | 'generic'            // Other errors

export interface MicrophoneError {
  type: MicrophoneErrorType
  message: string
  originalError?: Error
}

/**
 * Check if browser supports MediaDevices API
 */
export function isMediaDevicesSupported(): boolean {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
}

/**
 * Request microphone permission and get audio stream
 */
export async function requestMicrophoneAccess(): Promise<MediaStream> {
  if (!isMediaDevicesSupported()) {
    throw new Error('UNSUPPORTED_BROWSER')
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    })

    return stream
  } catch (error) {
    throw error
  }
}

/**
 * Enumerate available audio input devices
 */
export async function getAudioInputDevices(): Promise<AudioDevice[]> {
  if (!isMediaDevicesSupported()) {
    return []
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices()

    return devices
      .filter(device => device.kind === 'audioinput')
      .map(device => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${device.deviceId.slice(0, 5)}`,
        groupId: device.groupId || ''
      }))
  } catch (error) {
    console.error('Failed to enumerate audio devices:', error)
    return []
  }
}

/**
 * Request access to a specific audio device
 */
export async function requestSpecificDevice(deviceId: string): Promise<MediaStream> {
  if (!isMediaDevicesSupported()) {
    throw new Error('UNSUPPORTED_BROWSER')
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    })

    return stream
  } catch (error) {
    throw error
  }
}

/**
 * Classify microphone-related errors into user-friendly types
 */
export function classifyMicrophoneError(error: unknown): MicrophoneError {
  const err = error as Error

  // Browser not supported
  if (!isMediaDevicesSupported()) {
    return {
      type: 'unsupported',
      message: 'Your browser does not support microphone access. Please use Chrome, Firefox, Edge, or Safari.',
      originalError: err
    }
  }

  // Permission errors
  if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
    return {
      type: 'not_allowed',
      message: 'Microphone access was denied. Please allow microphone access in your browser settings.',
      originalError: err
    }
  }

  // No microphone found
  if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
    return {
      type: 'not_found',
      message: 'No microphone detected. Please connect a headset or external microphone.',
      originalError: err
    }
  }

  // Microphone in use
  if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
    return {
      type: 'not_readable',
      message: 'Your microphone is being used by another application. Please close other apps and try again.',
      originalError: err
    }
  }

  // Generic error
  return {
    type: 'generic',
    message: err.message || 'An error occurred while accessing your microphone. Please try again.',
    originalError: err
  }
}

/**
 * Stop all tracks in a media stream
 */
export function stopMediaStream(stream: MediaStream | null): void {
  if (!stream) return

  stream.getTracks().forEach(track => {
    track.stop()
  })
}

/**
 * Check if a media stream has active audio tracks
 */
export function hasActiveAudioTrack(stream: MediaStream | null): boolean {
  if (!stream) return false

  const audioTracks = stream.getAudioTracks()
  return audioTracks.length > 0 && audioTracks[0].readyState === 'live'
}

/**
 * Get browser-specific permission instructions
 */
export function getBrowserPermissionInstructions(): {
  browser: string
  instructions: string[]
} {
  const userAgent = navigator.userAgent.toLowerCase()

  if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
    return {
      browser: 'Chrome',
      instructions: [
        'Click the lock icon or camera icon in the address bar',
        'Select "Site settings"',
        'Find "Microphone" and change it to "Allow"',
        'Refresh the page'
      ]
    }
  }

  if (userAgent.includes('firefox')) {
    return {
      browser: 'Firefox',
      instructions: [
        'Click the camera icon in the address bar',
        'Click the "X" next to "Blocked Temporarily"',
        'Select "Allow" when prompted',
        'Refresh the page if needed'
      ]
    }
  }

  if (userAgent.includes('safari')) {
    return {
      browser: 'Safari',
      instructions: [
        'Click "Safari" in the menu bar',
        'Select "Settings for This Website"',
        'Change "Microphone" to "Allow"',
        'Refresh the page'
      ]
    }
  }

  if (userAgent.includes('edg')) {
    return {
      browser: 'Edge',
      instructions: [
        'Click the lock icon in the address bar',
        'Find "Microphone" and change it to "Allow"',
        'Refresh the page'
      ]
    }
  }

  // Generic instructions
  return {
    browser: 'your browser',
    instructions: [
      'Look for a microphone or camera icon in the address bar',
      'Click it and select "Allow" for microphone access',
      'Refresh the page if needed'
    ]
  }
}

/**
 * Detect browser info for compatibility checks
 */
export function getBrowserInfo() {
  const userAgent = navigator.userAgent.toLowerCase()

  const browsers = {
    chrome: /chrome|chromium|crios/.test(userAgent) && !/edg/.test(userAgent),
    firefox: /firefox|fxios/.test(userAgent),
    safari: /safari/.test(userAgent) && !/chrome/.test(userAgent),
    edge: /edg/.test(userAgent),
    opera: /opr|opera/.test(userAgent),
  }

  const browser = Object.keys(browsers).find(key => browsers[key as keyof typeof browsers]) || 'unknown'

  return {
    browser,
    userAgent,
    isMobile: /mobile|android|iphone|ipad|ipod/.test(userAgent),
    isSupported: isMediaDevicesSupported()
  }
}
