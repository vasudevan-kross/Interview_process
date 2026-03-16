'use client'

import { useEffect, useRef, useState } from 'react'

interface AudioLevelVisualizerProps {
  stream: MediaStream | null
  onAudioDetected?: () => void
  onSilenceDetected?: () => void
}

export function AudioLevelVisualizer({
  stream,
  onAudioDetected,
  onSilenceDetected
}: AudioLevelVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>()
  const audioContextRef = useRef<AudioContext>()
  const analyserRef = useRef<AnalyserNode>()
  const silenceTimerRef = useRef<NodeJS.Timeout>()
  const [hasDetectedAudio, setHasDetectedAudio] = useState(false)

  useEffect(() => {
    if (!stream) {
      // Clean up if stream is removed
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      return
    }

    // Initialize Audio Context and Analyser
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)

      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser

      // Start visualization
      visualize()
    } catch (error) {
      console.error('Failed to initialize audio visualizer:', error)
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
      }
    }
  }, [stream])

  function visualize() {
    const canvas = canvasRef.current
    const analyser = analyserRef.current

    if (!canvas || !analyser) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw)

      analyser.getByteFrequencyData(dataArray)

      // Clear canvas
      ctx.fillStyle = 'rgb(15 23 42)' // slate-900
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Calculate bar properties
      const barCount = 32
      const barWidth = canvas.width / barCount
      const barSpacing = 2

      // Draw bars
      for (let i = 0; i < barCount; i++) {
        // Sample data array evenly
        const dataIndex = Math.floor((i / barCount) * bufferLength)
        const value = dataArray[dataIndex]

        // Normalize to canvas height (0-1)
        const normalizedValue = value / 255
        const barHeight = normalizedValue * canvas.height

        // Color based on intensity
        let color
        if (normalizedValue > 0.7) {
          color = 'rgb(34 197 94)' // green-500
        } else if (normalizedValue > 0.4) {
          color = 'rgb(59 130 246)' // blue-500
        } else if (normalizedValue > 0.1) {
          color = 'rgb(99 102 241)' // indigo-500
        } else {
          color = 'rgb(71 85 105)' // slate-600
        }

        ctx.fillStyle = color

        // Draw bar from bottom up
        const x = i * barWidth
        const y = canvas.height - barHeight

        ctx.fillRect(
          x + barSpacing / 2,
          y,
          barWidth - barSpacing,
          barHeight
        )
      }

      // Check for audio activity
      const hasAudio = dataArray.some(value => value > 10)

      if (hasAudio) {
        if (!hasDetectedAudio) {
          setHasDetectedAudio(true)
          onAudioDetected?.()
        }

        // Reset silence timer
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
        }

        // Start new silence timer (5 seconds)
        silenceTimerRef.current = setTimeout(() => {
          if (hasDetectedAudio) {
            onSilenceDetected?.()
          }
        }, 5000)
      }
    }

    draw()
  }

  return (
    <div className="w-full space-y-2">
      <canvas
        ref={canvasRef}
        width={600}
        height={120}
        className="w-full rounded-lg bg-slate-900 border border-slate-700"
      />
      <p className="text-sm text-center text-slate-500">
        {hasDetectedAudio
          ? '🎤 Audio detected - Looking good!'
          : 'Speak into your microphone to see the bars move'}
      </p>
    </div>
  )
}
