import { useEffect, useRef, useState, useCallback } from 'react'
import { hasActiveAudioTrack } from '@/lib/utils/mediaDevices'

interface MicrophoneMonitorOptions {
  stream: MediaStream | null
  onDisconnected?: () => void
  silenceThresholdSeconds?: number
  checkIntervalMs?: number
}

export function useMicrophoneMonitor({
  stream,
  onDisconnected,
  silenceThresholdSeconds = 30,
  checkIntervalMs = 1000
}: MicrophoneMonitorOptions) {
  const [isConnected, setIsConnected] = useState(true)
  const [silenceDuration, setSilenceDuration] = useState(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize audio monitoring
  useEffect(() => {
    if (!stream) {
      cleanup()
      return
    }

    try {
      // Create audio context and analyser
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)

      analyser.fftSize = 256
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser

      setIsConnected(true)
      setSilenceDuration(0)

      // Monitor audio track state
      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length > 0) {
        const track = audioTracks[0]

        // Listen for track ended event
        track.onended = () => {
          console.warn('[MicMonitor] Audio track ended unexpectedly')
          handleDisconnection()
        }

        // Listen for track mute event
        track.onmute = () => {
          console.warn('[MicMonitor] Audio track muted')
        }

        track.onunmute = () => {
          console.log('[MicMonitor] Audio track unmuted')
          setSilenceDuration(0)
        }
      }

      // Start monitoring audio activity
      startActivityMonitoring()
    } catch (error) {
      console.error('[MicMonitor] Failed to initialize audio monitoring:', error)
    }

    return cleanup
  }, [stream])

  function startActivityMonitoring() {
    if (!analyserRef.current) return

    const analyser = analyserRef.current
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    let consecutiveSilentChecks = 0

    checkIntervalRef.current = setInterval(() => {
      if (!analyser) return

      // Get frequency data
      analyser.getByteFrequencyData(dataArray)

      // Check if there's audio activity (any value above threshold)
      const hasActivity = dataArray.some(value => value > 5)

      if (hasActivity) {
        // Reset silence counter
        consecutiveSilentChecks = 0
        setSilenceDuration(0)
      } else {
        // Increment silence counter
        consecutiveSilentChecks++
        const currentSilenceDuration = (consecutiveSilentChecks * checkIntervalMs) / 1000

        setSilenceDuration(currentSilenceDuration)

        // Check if silence threshold exceeded
        if (currentSilenceDuration >= silenceThresholdSeconds) {
          console.warn(
            `[MicMonitor] No audio detected for ${silenceThresholdSeconds}s - possible disconnection`
          )
          // Note: This is a warning, not necessarily a disconnection
          // Could be candidate not speaking, muted mic, etc.
        }
      }
    }, checkIntervalMs)
  }

  function handleDisconnection() {
    console.log('[MicMonitor] Microphone disconnected')
    setIsConnected(false)
    onDisconnected?.()
    cleanup()
  }

  function cleanup() {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current)
      checkIntervalRef.current = null
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    analyserRef.current = null
  }

  // Manual check function
  const checkConnection = useCallback(() => {
    if (!stream) {
      return false
    }

    const isActive = hasActiveAudioTrack(stream)

    if (!isActive && isConnected) {
      handleDisconnection()
      return false
    }

    return isActive
  }, [stream, isConnected])

  return {
    isConnected,
    silenceDuration,
    checkConnection
  }
}
