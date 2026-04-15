'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  getVideoCandidateByToken,
  uploadVideoRecording,
  getVideoInterviewWSUrl,
  type VideoInterviewCandidatePublic,
} from '@/lib/api/video-interviews'
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare,
  Loader2, AlertCircle, UserCircle,
} from 'lucide-react'

type InterviewState = 'loading' | 'ready' | 'greeting' | 'listening' | 'thinking' | 'speaking' | 'engaging' | 'done' | 'error'

interface TranscriptEntry {
  role: 'ai' | 'candidate'
  text: string
  time: string  // HH:MM
}

export default function VideoInterviewPage() {
  const params = useParams()
  const router = useRouter()
  const token = params?.token as string

  // Media refs
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const userStreamRef = useRef<MediaStream | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)

  // Audio refs — two contexts: TTS uses browser native rate, VAD must be 16 kHz
  const ttsCtxRef = useRef<AudioContext | null>(null)      // TTS playback
  const vadCtxRef = useRef<AudioContext | null>(null)      // mic capture at 16 kHz
  const vadWorkletRef = useRef<AudioWorkletNode | null>(null)
  const recordingDestRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const recordingMicSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const ttsQueueRef = useRef<AudioBufferSourceNode[]>([])
  const scheduledTimeRef = useRef<number>(0)

  // WebSocket ref
  const wsRef = useRef<WebSocket | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const sampleRateRef = useRef<number>(16000)
  const reconnectAttemptsRef = useRef<number>(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Transcript refs
  const ttsTextAccRef = useRef<string>('')
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null)
  const interviewStateRef = useRef<InterviewState>('loading')
  // TTS sync: only notify backend when ALL chunks have been sent AND played
  const ttsAllSentRef = useRef(false)

  // State
  const [candidate, setCandidate] = useState<VideoInterviewCandidatePublic | null>(null)
  const [interviewState, setInterviewState] = useState<InterviewState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isCameraOn, setIsCameraOn] = useState(true)
  const [showTranscript, setShowTranscript] = useState(false)
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([])
  const [liveAiText, setLiveAiText] = useState<string>('')   // streams in while AI speaks
  const [overlayMessage, setOverlayMessage] = useState<{ text: string; type: 'connection' } | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)
  const [isVadCalibrated, setIsVadCalibrated] = useState(false)

  // Debounce timer: delay audio_end so mid-sentence pauses don't cut the user off
  const endOfSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Set when user barges in — suppresses incoming TTS chunks until backend ACKs with new state
  const bargingInRef = useRef(false)

  // Keep interviewStateRef in sync
  useEffect(() => {
    interviewStateRef.current = interviewState
  }, [interviewState])

  // Auto-scroll transcript to bottom whenever entries or live text change
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight
    }
  }, [transcriptEntries, liveAiText])

  // Check setup gate synchronously before first paint to avoid flash
  useLayoutEffect(() => {
    if (!token) return
    const setupComplete = sessionStorage.getItem('videoInterviewSetupComplete')
    if (!setupComplete) {
      router.replace(`/video-interview/${token}/setup`)
    }
  }, [token, router])

  // Fetch candidate on mount
  useEffect(() => {
    if (!token) return
    getVideoCandidateByToken(token)
      .then((data) => {
        if (data.status === 'completed') {
          setError('You have already completed this interview. Thank you for your time!')
          setInterviewState('error')
          return
        }
        if (data.status === 'failed') {
          setError('This interview link has expired. Please contact the hiring team.')
          setInterviewState('error')
          return
        }
        setCandidate(data)
        setInterviewState('ready')
      })
      .catch(() => {
        setError('Interview link is invalid or expired.')
        setInterviewState('error')
      })
  }, [token])

  // ─── TTS Audio Queue ────────────────────────────────────────────────────────

  const enqueueTtsChunk = useCallback(async (audioB64: string) => {
    if (!ttsCtxRef.current) {
      // No forced sample rate — browser native rate (44.1/48 kHz).
      // decodeAudioData handles WAV headers at any rate correctly.
      ttsCtxRef.current = new AudioContext()
    }
    const ctx = ttsCtxRef.current
    if (ctx.state === 'suspended') await ctx.resume()

    const binary = atob(audioB64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    let audioBuffer: AudioBuffer
    try {
      audioBuffer = await ctx.decodeAudioData(bytes.buffer)
    } catch {
      return
    }

    // Barge-in may have fired while decodeAudioData was pending.
    // The chunk is not in ttsQueueRef yet so drainTtsQueue() missed it.
    // Check here and discard before scheduling playback.
    if (bargingInRef.current) return

    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    if (recordingDestRef.current) source.connect(recordingDestRef.current)

    const now = ctx.currentTime
    const startTime = Math.max(now, scheduledTimeRef.current)
    source.start(startTime)
    scheduledTimeRef.current = startTime + audioBuffer.duration

    ttsQueueRef.current.push(source)
    source.onended = () => {
      ttsQueueRef.current = ttsQueueRef.current.filter((n) => n !== source)
      // Only notify backend when ALL chunks were sent (tts_end received)
      // AND the playback queue is now empty — prevents premature firing
      // when the queue is temporarily empty between consecutive chunks.
      if (ttsAllSentRef.current && ttsQueueRef.current.length === 0 && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'tts_playback_complete' }))
        ttsAllSentRef.current = false
      }
    }
  }, [])

  const drainTtsQueue = useCallback(() => {
    ttsQueueRef.current.forEach((node) => {
      try { node.stop() } catch (_) {}
    })
    ttsQueueRef.current = []
    scheduledTimeRef.current = 0
  }, [])

  // ─── WS Message Handler ──────────────────────────────────────────────────────

  const handleServerMessage = useCallback(async (msg: Record<string, unknown>) => {
    switch (msg.type) {
      case 'state': {
        const newState = msg.value as InterviewState
        interviewStateRef.current = newState  // sync immediately, don't wait for useEffect
        if (newState !== 'speaking') bargingInRef.current = false  // barge-in resolved
        setInterviewState(newState)
        // Relay mode to AudioWorklet for barge-in threshold
        if (vadWorkletRef.current) {
          vadWorkletRef.current.port.postMessage({
            type: 'set_mode',
            mode: newState === 'speaking' ? 'speaking' : 'listening',
          })
        }
        break
      }

      case 'transcript': {
        const now = new Date()
        const hhmm = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`
        setTranscriptEntries((prev) => [...prev, { role: 'candidate', text: msg.text as string, time: hhmm }])
        break
      }

      case 'tts_chunk':
        if (bargingInRef.current) break  // discard in-flight chunks after barge-in
        ttsAllSentRef.current = false  // new TTS sequence in progress
        ttsTextAccRef.current += (ttsTextAccRef.current ? ' ' : '') + (msg.text as string)
        setLiveAiText(ttsTextAccRef.current)
        await enqueueTtsChunk(msg.audio as string)
        break

      case 'tts_end': {
        const now = new Date()
        const hhmm = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`
        if (ttsTextAccRef.current) {
          setTranscriptEntries((prev) => [...prev, { role: 'ai', text: ttsTextAccRef.current, time: hhmm }])
        }
        ttsTextAccRef.current = ''
        setLiveAiText('')
        setOverlayMessage(null)
        // Mark all chunks as sent; if queue already empty, notify backend now
        ttsAllSentRef.current = true
        if (ttsQueueRef.current.length === 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'tts_playback_complete' }))
          ttsAllSentRef.current = false
        }
        break
      }

      case 'engagement_prompt':
        // Kept for backward-compatibility; backend no longer sends this.
        break

      case 'session_started':
        sessionIdRef.current = msg.session_id as string
        break

      case 'ping':
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'pong' }))
        }
        break

      case 'interview_complete':
        setInterviewState('done')
        await handleInterviewComplete()
        break

      case 'error':
        setError((msg.message as string) || 'An error occurred')
        setInterviewState('error')
        break
    }
  }, [enqueueTtsChunk]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Recording Upload ────────────────────────────────────────────────────────

  const uploadingRef = useRef(false)
  const uploadRecording = useCallback(async () => {
    // Guard against double-upload (server interview_complete + user click "End")
    if (uploadingRef.current) { console.log('[Upload] Skipped: already uploading'); return }
    if (!mediaRecorderRef.current) { console.warn('[Upload] Skipped: no MediaRecorder'); return }
    const sid = sessionIdRef.current
    if (!sid) { console.warn('[Upload] Skipped: no session_id'); return }
    console.log('[Upload] Starting upload for session:', sid, 'recorder state:', mediaRecorderRef.current.state, 'chunks:', recordingChunksRef.current.length)
    uploadingRef.current = true
    setIsUploading(true)

    return new Promise<void>((resolve) => {
      let resolved = false
      const finish = () => { if (!resolved) { resolved = true; resolve() } }

      const doUpload = async () => {
        // recorder.mimeType is the actual negotiated type (may include codecs string).
        // Use it as-is for the Blob, but strip codec params for the File type sent to the server.
        const rawMime = mediaRecorderRef.current?.mimeType || 'video/webm'
        const baseMime = rawMime.split(';')[0].trim() || 'video/webm'
        const ext = baseMime.includes('mp4') ? 'mp4' : 'webm'
        const blob = new Blob(recordingChunksRef.current, { type: baseMime })
        console.log('[Upload] Blob created:', blob.size, 'bytes, type:', baseMime, 'chunks used:', recordingChunksRef.current.length)
        recordingChunksRef.current = []
        if (blob.size === 0) {
          console.warn('[Upload] Aborted: blob is empty (0 bytes)')
          setIsUploading(false)
          uploadingRef.current = false
          finish()
          return
        }
        // Supabase free plan hard limit is 50 MB — skip upload if exceeded
        const MAX_UPLOAD_BYTES = 48 * 1024 * 1024  // 48 MB safety margin
        if (blob.size > MAX_UPLOAD_BYTES) {
          console.warn('[Upload] Recording too large for free plan:', Math.round(blob.size / 1024 / 1024), 'MB — skipping upload')
          setIsUploading(false)
          uploadingRef.current = false
          finish()
          return
        }
        try {
          const file = new File([blob], `interview.${ext}`, { type: baseMime })
          console.log('[Upload] Uploading file:', file.name, file.size, 'bytes to session:', sid)
          await uploadVideoRecording(sid, file)
          console.log('[Upload] Upload succeeded')
        } catch (e) {
          console.error('[Upload] Recording upload failed:', e)
        } finally {
          setIsUploading(false)
          uploadingRef.current = false
          finish()
        }
      }

      if (mediaRecorderRef.current!.state === 'recording') {
        try {
          mediaRecorderRef.current!.addEventListener('stop', doUpload, { once: true })
          mediaRecorderRef.current!.stop()
          // Fallback: if 'stop' event doesn't fire within 3 seconds, force upload
          setTimeout(() => { if (!resolved) doUpload() }, 3000)
        } catch (err) {
          mediaRecorderRef.current!.removeEventListener('stop', doUpload)
          doUpload()
        }
      } else {
        doUpload()
      }
    })
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleInterviewComplete = useCallback(async () => {
    await uploadRecording()
    router.push(`/video-interview/${token}/submitted`)
  }, [uploadRecording, router, token])

  // ─── Start Interview ─────────────────────────────────────────────────────────

  const [joining, setJoining] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)

  const handleStartInterview = async () => {
    if (joining) return  // prevent double-click
    setJoining(true)
    try {
      // Unlock TTS AudioContext (browser native rate) on user gesture
      if (!ttsCtxRef.current) ttsCtxRef.current = new AudioContext()
      if (ttsCtxRef.current.state === 'suspended') await ttsCtxRef.current.resume()

      // VAD AudioContext must be 16 kHz so PCM sent to STT is the right rate
      if (!vadCtxRef.current) vadCtxRef.current = new AudioContext({ sampleRate: 16000 })
      if (vadCtxRef.current.state === 'suspended') await vadCtxRef.current.resume()

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      userStreamRef.current = stream

      // Build a dedicated recording stream so the saved interview always contains
      // the candidate mic, even while the same mic is also routed through VAD.
      // We also mirror AI speech into the recording to preserve the full exchange.
      const ttsCtx = ttsCtxRef.current!
      const recordingDest = ttsCtx.createMediaStreamDestination()
      recordingDestRef.current = recordingDest

      const recordingMicSource = ttsCtx.createMediaStreamSource(stream)
      recordingMicSource.connect(recordingDest)
      recordingMicSourceRef.current = recordingMicSource

      const mixedTracks = [
        ...stream.getVideoTracks(),
        ...recordingDest.stream.getAudioTracks(),
      ]
      const recordingStream = mixedTracks.length > 0 ? new MediaStream(mixedTracks) : stream
      recordingStreamRef.current = recordingStream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Determine the best supported MIME type for recording.
      // Priority order: webm (Chrome/Firefox desktop) → mp4 variants (iOS Safari 14.3+).
      // iOS Safari doesn't support webm at all, but does support video/mp4.
      const mimeTypeCandidates = [
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9,opus',
        'video/webm',
        'video/mp4;codecs=h264,aac',
        'video/mp4;codecs=avc1',
        'video/mp4',
      ]
      const mimeType = mimeTypeCandidates.find((t) => {
        try { return MediaRecorder.isTypeSupported(t) } catch { return false }
      }) ?? ''

      // Low bitrate keeps recordings under Supabase free plan's 50 MB hard limit.
      // 96 kbps video + 24 kbps audio ≈ 0.9 MB/min → ~18 MB for a 20-min interview,
      // ~27 MB for 30 min, ~40 MB for 45 min — all safely under 50 MB.
      const recorderOptions: MediaRecorderOptions = {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 96_000,
        audioBitsPerSecond: 24_000,
      }
      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(recordingStream, recorderOptions)
      } catch {
        // Last-resort: let the browser pick its own default format.
        recorder = new MediaRecorder(recordingStream)
      }
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data)
      }
      recorder.start(1000)
      mediaRecorderRef.current = recorder

      // Setup AudioWorklet VAD on the 16 kHz context
      const ctx = vadCtxRef.current!
      await ctx.audioWorklet.addModule('/worklets/vad-processor.js')
      const vadNode = new AudioWorkletNode(ctx, 'vad-processor')
      vadWorkletRef.current = vadNode

      // Tell the worklet the ACTUAL hardware sample rate (iOS Safari ignores
      // the sampleRate hint and uses 44100/48000 Hz; without this the frame
      // size is wrong and STT gets PCM at the wrong rate → empty transcripts).
      const actualSampleRate = ctx.sampleRate
      sampleRateRef.current = actualSampleRate
      vadNode.port.postMessage({ type: 'init', sampleRate: actualSampleRate })

      // Connect mic → vad (NOT to destination, no echo)
      const micSource = ctx.createMediaStreamSource(stream)
      micSource.connect(vadNode)

      vadNode.port.onmessage = (e) => {
        const { type, data } = e.data

        if (type === 'calibrated') {
          setIsVadCalibrated(true)
        }

        if (type === 'chunk' && wsRef.current?.readyState === WebSocket.OPEN) {
          // PCM ArrayBuffer → Uint8Array → base64 → send
          const uint8 = new Uint8Array(data as ArrayBuffer)
          let binary = ''
          const chunkSize = 8192
          for (let i = 0; i < uint8.length; i += chunkSize) {
            binary += String.fromCharCode(...Array.from(uint8.subarray(i, i + chunkSize)))
          }
          const b64 = btoa(binary)
          wsRef.current.send(JSON.stringify({ type: 'audio_chunk', data: b64 }))
        }

        if (type === 'speech_start') {
          // Cancel any pending end-of-speech — user resumed speaking
          if (endOfSpeechTimerRef.current) {
            clearTimeout(endOfSpeechTimerRef.current)
            endOfSpeechTimerRef.current = null
          }
          setIsUserSpeaking(true)

          if (interviewStateRef.current === 'speaking') {
            // Barge-in: stop audio immediately, ignore any in-flight TTS chunks
            bargingInRef.current = true
            drainTtsQueue()
            ttsTextAccRef.current = ''
            setLiveAiText('')
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'barge_in' }))
            }
          }
        }

        if (type === 'end_of_speech' && wsRef.current?.readyState === WebSocket.OPEN) {
          setIsUserSpeaking(false)
          // Debounce: wait 1s before sending — if user resumes in that window,
          // speech_start above will cancel this and keep accumulating audio
          if (endOfSpeechTimerRef.current) clearTimeout(endOfSpeechTimerRef.current)
          endOfSpeechTimerRef.current = setTimeout(() => {
            endOfSpeechTimerRef.current = null
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'audio_end', sample_rate: sampleRateRef.current }))
            }
          }, 400) // 400ms debounce
        }
      }

      // Open WebSocket — extracted so we can reconnect without re-initialising media.
      const connectWs = () => {
        const wsUrl = getVideoInterviewWSUrl(token)
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          reconnectAttemptsRef.current = 0
          setOverlayMessage(null)
        }

        ws.onmessage = async (event) => {
          try {
            const msg = JSON.parse(event.data as string) as Record<string, unknown>
            await handleServerMessage(msg)
          } catch (e) {
            console.error('WS message parse error:', e)
          }
        }

        ws.onclose = () => {
          const s = interviewStateRef.current
          if (s === 'done' || s === 'ready' || s === 'loading') {
            // Interview completed or never started — no reconnect needed.
            // Upload is handled by handleInterviewComplete (via interview_complete msg).
            return
          }
          if (reconnectAttemptsRef.current < 3) {
            reconnectAttemptsRef.current++
            setOverlayMessage({ text: `Connection lost — reconnecting… (${reconnectAttemptsRef.current}/3)`, type: 'connection' })
            reconnectTimerRef.current = setTimeout(connectWs, 2000)
          } else {
            // Exhausted reconnect attempts — upload whatever we have as a last resort
            setOverlayMessage({ text: 'Connection lost. Please refresh and try again.', type: 'connection' })
            if (sessionIdRef.current && !uploadingRef.current) {
              console.log('[WS] Reconnect exhausted — uploading recording as fallback')
              uploadRecording()
            }
          }
        }

        ws.onerror = (e) => {
          console.error('WS error:', e)
        }
      }

      connectWs()

    } catch (err) {
      console.error('Start interview error:', err)
      setError('Failed to start interview. Please check camera/microphone permissions.')
      setInterviewState('error')
      setJoining(false)
    }
  }

  // ─── Device Toggles ──────────────────────────────────────────────────────────

  const toggleMic = () => {
    const newEnabled = !isMicOn
    setIsMicOn(newEnabled)
    userStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = newEnabled })
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: newEnabled ? 'mic_on' : 'mic_off' }))
    }
  }

  const toggleCamera = () => {
    const newEnabled = !isCameraOn
    setIsCameraOn(newEnabled)
    userStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = newEnabled })
  }

  const handleEndInterview = () => {
    setShowEndConfirm(true)
  }

  const confirmEndInterview = async () => {
    setShowEndConfirm(false)
    // Prevent reconnect loop after a deliberate end.
    reconnectAttemptsRef.current = 99
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'disconnect' }))
    }
    wsRef.current?.close()
    setInterviewState('done')
    await uploadRecording()
    router.push(`/video-interview/${token}/submitted`)
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
      userStreamRef.current?.getTracks().forEach((t) => t.stop())
      recordingStreamRef.current?.getTracks().forEach((t) => t.stop())
      recordingMicSourceRef.current?.disconnect()
      recordingDestRef.current = null
      ttsCtxRef.current?.close().catch(() => {})
      vadCtxRef.current?.close().catch(() => {})
    }
  }, [])

  // ─── Camera PiP — set srcObject once the video element is in the DOM ───────
  // isActive controls conditional rendering of the PiP; when it becomes true
  // the <video> ref mounts but userStreamRef was already set during getUserMedia.
  useEffect(() => {
    if (videoRef.current && userStreamRef.current) {
      videoRef.current.srcObject = userStreamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [interviewState]) // re-run whenever state changes (including 'ready' → 'greeting')

  // ─── Render ──────────────────────────────────────────────────────────────────

  const isActive = interviewState !== 'ready' && interviewState !== 'loading' && interviewState !== 'error'

  if (interviewState === 'loading') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#09090b] text-white selection:bg-blue-500/30">
        <div className="relative flex items-center justify-center mb-8">
          <div className="absolute inset-0 rounded-[40px] blur-2xl bg-gradient-to-tr from-blue-500/20 to-purple-500/20 animate-pulse" />
          <div className="w-24 h-24 rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-2xl flex items-center justify-center relative z-10 shadow-2xl">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-white mb-2">Authenticating secure connection...</h2>
        <p className="text-slate-400/80 text-sm font-medium">Please wait while we set up your interview space.</p>
      </div>
    )
  }

  if (interviewState === 'error') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#09090b] text-white p-6">
        <div className="w-24 h-24 rounded-[32px] border border-red-500/20 bg-red-500/10 backdrop-blur-xl flex items-center justify-center mb-6 shadow-2xl shadow-red-500/10">
           <AlertCircle className="h-10 w-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight mb-2">Interview Unavailable</h2>
        <p className="text-sm text-slate-400 max-w-sm text-center">{error}</p>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#09090b] flex flex-col overflow-hidden relative font-sans selection:bg-blue-500/30">

      {/* Upload spinner overlay */}
      {isUploading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xl">
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-[32px] p-10 flex flex-col items-center gap-6 shadow-2xl">
            <Loader2 className="h-10 w-10 text-blue-400 animate-spin" />
            <p className="text-white text-lg font-medium tracking-tight">Saving your interview recording…</p>
          </div>
        </div>
      )}

      {/* Top Header - Apple Glass */}
      <header className="absolute top-0 w-full h-24 flex items-center justify-between px-6 sm:px-10 z-30 pointer-events-none">
        <div className="flex items-center gap-4">
          <div className="bg-white/[0.03] backdrop-blur-3xl rounded-2xl px-4 py-2 flex items-center gap-3 border border-white/[0.08] pointer-events-auto shadow-sm">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-slate-200 text-sm font-medium tracking-wide">
              {candidate?.campaign_name || 'Interview Room'}
            </span>
          </div>
        </div>

        {/* Recording indicator */}
        {isActive && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/[0.05] px-4 py-2 shadow-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-300">REC</span>
          </div>
        )}
      </header>

      {/* Main View Area */}
      <main className="flex-1 min-h-0 w-full flex items-center justify-center relative p-4 sm:p-10 pt-24 pb-32">
        <div className="w-full h-full max-w-[1440px] relative flex items-center justify-center">

          {/* --- ACTIVE INTERVIEW AREA --- */}
          {isActive && (
            <div className="w-full h-full bg-[#18181b] rounded-[32px] md:rounded-[48px] overflow-hidden relative shadow-2xl border border-white/[0.04] ring-1 ring-white/[0.02] flex items-center justify-center transition-all duration-700">
               {/* Interviewer panel background */}
               <div className="absolute inset-0 bg-gradient-to-b from-slate-800/20 to-slate-900/40" />
               
               <div className={`relative rounded-full bg-white/[0.02] border border-white/[0.05] p-10 backdrop-blur-3xl shadow-2xl transition-all duration-500 ease-out
                  ${(interviewState === 'speaking' || interviewState === 'greeting' || interviewState === 'engaging') 
                    ? 'ring-4 ring-indigo-500/30 scale-105 shadow-[0_0_60px_-10px_rgba(99,102,241,0.3)]' 
                    : ''}`}>
                 <UserCircle className="w-32 h-32 text-slate-300/80" />
               </div>

               {/* Active Status badge */}
               <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20">
                 <span className={`rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide backdrop-blur-xl border transition-colors duration-300
                   ${isUserSpeaking && isMicOn && interviewState === 'listening'
                     ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                     : interviewState === 'listening' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                     interviewState === 'thinking' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                     (interviewState === 'speaking' || interviewState === 'engaging' || interviewState === 'greeting')
                       ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                     'bg-slate-800/40 text-slate-400 border-slate-700/50'}`}
                 >
                    {isUserSpeaking && isMicOn && interviewState === 'listening' ? '🎤 You\'re speaking' :
                     !isVadCalibrated && interviewState === 'listening' ? '⌛ Calibrating Mic…' :
                     interviewState === 'listening' ? '● Listening' :
                     interviewState === 'thinking' ? '⏳ Thinking…' :
                     (interviewState === 'speaking' || interviewState === 'engaging' || interviewState === 'greeting') ? '◎ Speaking' : ''}
                 </span>
               </div>

               {/* Engagement overlay */}
               {overlayMessage && (
                 <div className={`absolute top-24 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold shadow-xl backdrop-blur-xl border transition-all animate-in fade-in slide-in-from-top-4 duration-300
                   ${overlayMessage.type === 'connection'
                     ? 'bg-red-500/10 text-red-400 border-red-500/20'
                     : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}
                 >
                   {overlayMessage.text}
                 </div>
               )}

               {/* Collapsible transcript panel */}
               <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 w-[92%] max-w-2xl overflow-hidden rounded-[24px] bg-black/60 backdrop-blur-3xl border border-white/[0.08] transition-all duration-500 ease-in-out z-20 shadow-2xl ${
                    showTranscript ? 'max-h-80 opacity-100 translate-y-0' : 'max-h-0 opacity-0 translate-y-8 pointer-events-none'
                  }`}
               >
                 <div className="flex flex-col h-80">
                   {/* Header */}
                   <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-white/[0.06] flex-shrink-0">
                     <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Live Transcript</p>
                     <span className="text-[10px] text-slate-500">{transcriptEntries.length} messages</span>
                   </div>

                   {/* Messages */}
                   <div ref={transcriptScrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                     {transcriptEntries.length === 0 && !liveAiText && (
                       <p className="text-center text-slate-500 text-xs py-6">Conversation will appear here…</p>
                     )}

                     {transcriptEntries.map((entry, i) => (
                       <div key={i} className={`flex flex-col gap-0.5 ${entry.role === 'candidate' ? 'items-end' : 'items-start'}`}>
                         <div className={`flex items-center gap-2 px-0.5 ${entry.role === 'candidate' ? 'flex-row-reverse' : ''}`}>
                           <span className={`text-[10px] font-semibold ${entry.role === 'ai' ? 'text-indigo-400' : 'text-emerald-400'}`}>
                             {entry.role === 'ai' ? 'Interviewer' : 'You'}
                           </span>
                           <span className="text-[10px] text-slate-600">{entry.time}</span>
                         </div>
                         <div className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                           entry.role === 'ai'
                             ? 'bg-indigo-500/15 text-slate-200 rounded-tl-sm'
                             : 'bg-emerald-500/15 text-slate-200 rounded-tr-sm'
                         }`}>
                           {entry.text}
                         </div>
                       </div>
                     ))}

                     {/* Live streaming bubble — appears while AI is speaking */}
                     {liveAiText && (
                       <div className="flex flex-col gap-0.5 items-start">
                         <span className="text-[10px] font-semibold text-indigo-400 px-0.5">Interviewer</span>
                         <div className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-tl-sm bg-indigo-500/10 border border-indigo-500/20 text-sm leading-relaxed text-slate-300">
                           {liveAiText}
                           <span className="inline-block w-1.5 h-3.5 ml-1 bg-indigo-400/70 rounded-sm align-middle animate-pulse" />
                         </div>
                       </div>
                     )}
                   </div>
                 </div>
               </div>
            </div>
          )}

          {/* --- PRE-FLIGHT LOBBY (Ready State) --- */}
          {interviewState === 'ready' && (
            <div className="w-full max-w-3xl flex flex-col items-center animate-in fade-in zoom-in-95 duration-700 z-30">
               {/* Candidate Preview Card */}
               <div className="w-full aspect-video bg-[#1a1a1c] border border-white/[0.08] rounded-[32px] md:rounded-[40px] overflow-hidden shadow-2xl relative mb-10 ring-1 ring-white/[0.02]">
                  {!isCameraOn ? (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#2a2a2c] to-[#121214]">
                          <UserCircle className="w-24 h-24 text-white/10" />
                      </div>
                  ) : (
                      <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />
                  )}
                  
                  {/* Floating Mic Check Analyzer replacing traditional static badges */}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full px-5 py-2.5 shadow-xl">
                     <div className="flex items-center gap-1 h-4">
                        <div className="w-1.5 h-full bg-emerald-400 rounded-full animate-[pulse_1s_ease-in-out_infinite] shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                        <div className="w-1.5 h-2/3 bg-emerald-400 rounded-full animate-[pulse_1.2s_ease-in-out_infinite] shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                        <div className="w-1.5 h-4/5 bg-emerald-400 rounded-full animate-[pulse_0.8s_ease-in-out_infinite] shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                        <div className="w-1.5 h-1/2 bg-emerald-400 rounded-full animate-[pulse_1.5s_ease-in-out_infinite] shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                     </div>
                     <span className="text-sm font-semibold text-slate-200">Device Check Ready</span>
                  </div>
               </div>

               <h2 className="text-3xl font-semibold tracking-tight text-white mb-2">Ready to join?</h2>
               <p className="text-slate-400/90 mb-8 max-w-sm text-center text-sm font-medium leading-relaxed">
                  The interviewer is waiting in the room. Ensure your environment is quiet and well-lit.
               </p>

               <Button
                  onClick={handleStartInterview}
                  disabled={joining}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-7 rounded-full font-semibold text-lg transition-all shadow-[0_8px_32px_-8px_rgba(37,99,235,0.6)] hover:shadow-[0_8px_40px_-4px_rgba(37,99,235,0.7)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {joining ? 'Joining…' : 'Join Interview'}
                </Button>
            </div>
          )}

          {/* Floating Candidate PiP (bottom right) */}
          {isActive && (
            <div className={`absolute bottom-6 right-6 w-32 aspect-[3/4] sm:w-56 sm:aspect-video bg-[#1a1a1c] border rounded-[24px] overflow-hidden shadow-2xl z-30 transition-all duration-300
              ${isUserSpeaking && isMicOn
                ? 'border-emerald-500/60 ring-2 ring-emerald-500/40 shadow-[0_0_24px_rgba(52,211,153,0.2)]'
                : 'border-white/[0.08] ring-1 ring-white/[0.02]'}`}>
              <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-xl rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300 z-10 border border-white/[0.05]">
                You
              </div>
              {!isCameraOn ? (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#2a2a2c] to-[#121214]">
                  <UserCircle className="w-10 h-10 text-white/10" />
                </div>
              ) : (
                <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />
              )}
              {!isMicOn && (
                <div className="absolute bottom-3 left-3 bg-red-500 border border-white/20 rounded-full p-1.5 z-10 shadow-lg backdrop-blur-md">
                  <MicOff className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Control Bar - Floating Apple Dock Style */}
      <div className={`absolute bottom-6 w-full flex justify-center z-40 transition-all duration-700 ${
        interviewState === 'ready' ? 'opacity-0 translate-y-10 pointer-events-none' : 'opacity-100 translate-y-0'
      }`}>
        <div className="flex items-center gap-3 bg-white/[0.03] backdrop-blur-3xl border border-white/[0.08] px-4 py-3 rounded-full shadow-2xl ring-1 ring-white/[0.02]">
          
          <button
            onClick={toggleMic}
            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all duration-300
              ${!isMicOn
                ? 'bg-red-500 hover:bg-red-400 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                : isUserSpeaking
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-[0_0_20px_rgba(52,211,153,0.35)] scale-110'
                  : 'bg-white/10 hover:bg-white/20 text-white border border-white/5'}`}
            aria-label={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
          >
            {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          <button
            onClick={toggleCamera}
            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all duration-300
              ${isCameraOn
                ? 'bg-white/10 hover:bg-white/20 text-white border border-white/5'
                : 'bg-red-500 hover:bg-red-400 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]'}`}
            aria-label={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
          >
            {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          <button
            onClick={() => setShowTranscript((v) => !v)}
            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all duration-300
              ${showTranscript
                ? 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]'
                : 'bg-white/10 hover:bg-white/20 text-slate-300 border border-white/5'}`}
            aria-label="Toggle transcript"
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          <div className="w-px h-8 bg-white/10 mx-1" />

          <button
            onClick={handleEndInterview}
            className="pl-4 pr-5 sm:pl-5 sm:pr-6 h-12 sm:h-14 rounded-full flex items-center gap-2.5 bg-red-500 hover:bg-red-400 text-white font-semibold transition-all duration-300 shadow-[0_0_20px_rgba(239,68,68,0.4)]"
            aria-label="End interview"
          >
            <PhoneOff className="w-5 h-5" />
            <span className="text-sm tracking-wide hidden sm:inline">End Interview</span>
          </button>
        </div>
      </div>

    <ConfirmDialog
      open={showEndConfirm}
      onOpenChange={setShowEndConfirm}
      onConfirm={confirmEndInterview}
      title="End Interview?"
      description="Are you sure you want to end the interview? Your responses so far will be saved and submitted."
      confirmText="End Interview"
      cancelText="Continue"
      variant="destructive"
    />
    </div>
  )
}
