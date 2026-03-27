'use client'

import { useState, useRef, useCallback } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

// Preferred MIME types in priority order
const PREFERRED_MIME_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
]

function getSupportedMimeType(): string {
  if (typeof window === 'undefined') return 'video/webm'
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return 'video/webm'
}

async function uploadChunk(
  sessionId: string,
  stream: 'webcam' | 'screen',
  chunk: Blob,
  sequence: number
): Promise<void> {
  const endpoint = stream === 'webcam'
    ? `${API_BASE}/coding-interviews/video-session/${sessionId}/upload-webcam-chunk?sequence=${sequence}`
    : `${API_BASE}/coding-interviews/video-session/${sessionId}/upload-screen-chunk?sequence=${sequence}`

  const formData = new FormData()
  formData.append('file', chunk, `chunk-${sequence.toString().padStart(4, '0')}.webm`)

  try {
    const res = await fetch(endpoint, { method: 'POST', body: formData })
    if (!res.ok) {
      console.error(`[VideoProctoring] Failed to upload ${stream} chunk ${sequence}:`, res.statusText)
    }
  } catch (err) {
    // Non-blocking — we never fail the interview over a missed chunk
    console.error(`[VideoProctoring] Chunk upload error (${stream} #${sequence}):`, err)
  }
}

export interface VideoProctoringState {
  isRecording: boolean
  sessionId: string | null
  webcamStream: MediaStream | null
  isMobile: boolean
  error: string | null
}

export interface UseVideoProctoringReturn extends VideoProctoringState {
  selfViewRef: React.RefObject<HTMLVideoElement>
  startRecording: (submissionId: string) => Promise<void>
  stopRecording: () => Promise<void>
}

export function useVideoProctoring(): UseVideoProctoringReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  const selfViewRef = useRef<HTMLVideoElement>(null!)
  const webcamRecorderRef = useRef<MediaRecorder | null>(null)
  const screenRecorderRef = useRef<MediaRecorder | null>(null)
  const webcamSeqRef = useRef(0)
  const screenSeqRef = useRef(0)
  const startTimeRef = useRef<number>(0)
  const sessionIdRef = useRef<string | null>(null)

  const startRecording = useCallback(async (submissionId: string) => {
    try {
      setError(null)

      const isOnMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
      setIsMobile(isOnMobile)

      const browserInfo = navigator.userAgent.slice(0, 200)

      // 1. Create backend session
      const res = await fetch(`${API_BASE}/coding-interviews/video-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_id: submissionId,
          browser_info: browserInfo,
          is_mobile: isOnMobile,
        }),
      })

      if (!res.ok) throw new Error('Failed to create video session')
      const session = await res.json()
      setSessionId(session.id)
      sessionIdRef.current = session.id

      const mimeType = getSupportedMimeType()

      // 2. Webcam stream
      let camStream: MediaStream | null = null
      try {
        camStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 15 } },
          audio: false,
        })
      } catch {
        // Camera denied — record without webcam
        console.warn('[VideoProctoring] Webcam permission denied, continuing without webcam')
      }

      // 3. Screen stream (desktop only)
      let screenStream: MediaStream | null = null
      if (!isOnMobile) {
        try {
          screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
            video: { frameRate: { ideal: 5, max: 10 } },
          })
        } catch {
          console.warn('[VideoProctoring] Screen sharing denied, continuing without screen recording')
        }
      }

      // Attach webcam to self-view
      if (camStream) {
        setWebcamStream(camStream)
        if (selfViewRef.current) {
          selfViewRef.current.srcObject = camStream
        }
      }

      startTimeRef.current = Date.now()
      webcamSeqRef.current = 0
      screenSeqRef.current = 0

      // 4. Webcam recorder
      if (camStream) {
        const webcamRec = new MediaRecorder(camStream, {
          mimeType,
          videoBitsPerSecond: 300_000, // 300 kbps
        })
        webcamRec.ondataavailable = (e) => {
          if (e.data.size > 0 && sessionIdRef.current) {
            uploadChunk(sessionIdRef.current, 'webcam', e.data, webcamSeqRef.current++)
          }
        }
        webcamRec.start(30_000) // 30-second chunks
        webcamRecorderRef.current = webcamRec
      }

      // 5. Screen recorder
      if (screenStream) {
        const screenRec = new MediaRecorder(screenStream, {
          mimeType,
          videoBitsPerSecond: 500_000, // 500 kbps  
        })
        screenRec.ondataavailable = (e) => {
          if (e.data.size > 0 && sessionIdRef.current) {
            uploadChunk(sessionIdRef.current, 'screen', e.data, screenSeqRef.current++)
          }
        }
        screenRec.start(30_000)
        screenRecorderRef.current = screenRec

        // If user stops sharing, stop the recorder too
        screenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          screenRec.stop()
        })
      }

      setIsRecording(true)
    } catch (err: any) {
      const msg = err?.message || 'Unknown error starting video recording'
      setError(msg)
      console.error('[VideoProctoring] startRecording error:', err)
      throw err // Let caller decide whether to block
    }
  }, [])

  const stopRecording = useCallback(async () => {
    const sid = sessionIdRef.current
    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000)

    // Stop all tracks and recorders
    if (webcamRecorderRef.current && webcamRecorderRef.current.state !== 'inactive') {
      webcamRecorderRef.current.requestData() // flush last chunk
      webcamRecorderRef.current.stop()
    }
    if (screenRecorderRef.current && screenRecorderRef.current.state !== 'inactive') {
      screenRecorderRef.current.requestData()
      screenRecorderRef.current.stop()
    }

    // Stop all media tracks
    webcamStream?.getTracks().forEach((t) => t.stop())
    setWebcamStream(null)
    setIsRecording(false)

    // Wait a brief moment for the last ondataavailable to fire
    await new Promise((r) => setTimeout(r, 1500))

    // Finalize session
    if (sid) {
      try {
        await fetch(`${API_BASE}/coding-interviews/video-session/${sid}/finalize?webcam_complete=true&screen_complete=${screenRecorderRef.current !== null}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            webcam_duration: durationSeconds,
            screen_duration: durationSeconds,
          }),
        })
      } catch (err) {
        console.error('[VideoProctoring] Failed to finalize session:', err)
      }
    }

    webcamRecorderRef.current = null
    screenRecorderRef.current = null
    sessionIdRef.current = null
  }, [webcamStream])

  return {
    isRecording,
    sessionId,
    webcamStream,
    isMobile,
    error,
    selfViewRef,
    startRecording,
    stopRecording,
  }
}
