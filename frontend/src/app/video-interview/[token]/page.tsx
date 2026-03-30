'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  getVideoCandidateByToken,
  uploadVideoRecording,
  getVideoInterviewWSUrl,
  type VideoInterviewCandidatePublic,
} from '@/lib/api/video-interviews'
import VRMAvatar from '@/components/video-interview/VRMAvatar'
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare,
  Loader2, AlertCircle, UserCircle,
} from 'lucide-react'

type InterviewState = 'loading' | 'ready' | 'greeting' | 'listening' | 'thinking' | 'speaking' | 'engaging' | 'done' | 'error'

interface TranscriptEntry {
  role: 'ai' | 'candidate'
  text: string
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

  // Audio refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const vadWorkletRef = useRef<AudioWorkletNode | null>(null)
  const ttsQueueRef = useRef<AudioBufferSourceNode[]>([])
  const scheduledTimeRef = useRef<number>(0)

  // WebSocket ref
  const wsRef = useRef<WebSocket | null>(null)

  // Transcript refs
  const ttsTextAccRef = useRef<string>('')
  const isEngagementTurnRef = useRef(false)
  const interviewStateRef = useRef<InterviewState>('loading')

  // State
  const [candidate, setCandidate] = useState<VideoInterviewCandidatePublic | null>(null)
  const [interviewState, setInterviewState] = useState<InterviewState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isCameraOn, setIsCameraOn] = useState(true)
  const [showTranscript, setShowTranscript] = useState(false)
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([])
  const [overlayMessage, setOverlayMessage] = useState<{ text: string; type: 'silence' | 'mic_off' | 'connection' } | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // Keep interviewStateRef in sync
  useEffect(() => {
    interviewStateRef.current = interviewState
  }, [interviewState])

  // Check setup gate
  useEffect(() => {
    const setupComplete = sessionStorage.getItem('videoInterviewSetupComplete')
    if (!setupComplete && token) {
      router.push(`/video-interview/${token}/setup`)
    }
  }, [token, router])

  // Fetch candidate on mount
  useEffect(() => {
    if (!token) return
    getVideoCandidateByToken(token)
      .then((data) => {
        if (data.status === 'completed' || data.status === 'failed') {
          setError('This interview link has expired.')
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
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 16000 })
    }
    const ctx = audioContextRef.current
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

    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)

    const now = ctx.currentTime
    const startTime = Math.max(now, scheduledTimeRef.current)
    source.start(startTime)
    scheduledTimeRef.current = startTime + audioBuffer.duration

    ttsQueueRef.current.push(source)
    source.onended = () => {
      ttsQueueRef.current = ttsQueueRef.current.filter((n) => n !== source)
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

      case 'transcript':
        setTranscriptEntries((prev) => [...prev, { role: 'candidate', text: msg.text as string }])
        break

      case 'tts_chunk':
        ttsTextAccRef.current += (ttsTextAccRef.current ? ' ' : '') + (msg.text as string)
        await enqueueTtsChunk(msg.audio as string)
        break

      case 'tts_end':
        if (!isEngagementTurnRef.current && ttsTextAccRef.current) {
          setTranscriptEntries((prev) => [...prev, { role: 'ai', text: ttsTextAccRef.current }])
        }
        ttsTextAccRef.current = ''
        isEngagementTurnRef.current = false
        setOverlayMessage(null)
        break

      case 'engagement_prompt':
        isEngagementTurnRef.current = true
        setOverlayMessage({
          text: msg.reason === 'mic_off'
            ? 'Mic is off — please unmute to continue'
            : "Take your time — I'm listening whenever you're ready",
          type: msg.reason as 'silence' | 'mic_off' | 'connection',
        })
        break

      case 'ping':
        wsRef.current?.send(JSON.stringify({ type: 'pong' }))
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

  const uploadRecording = useCallback(async (sessionIdFromSummary?: string) => {
    if (!mediaRecorderRef.current) return
    setIsUploading(true)

    // The backend uses the token to find the session, so pass token as sessionId fallback
    const sid = sessionIdFromSummary || token

    return new Promise<void>((resolve) => {
      const doUpload = async () => {
        const blob = new Blob(recordingChunksRef.current, { type: 'video/webm' })
        recordingChunksRef.current = []
        try {
          await uploadVideoRecording(sid, new File([blob], 'interview.webm', { type: 'video/webm' }))
        } catch (e) {
          console.error('Recording upload failed:', e)
        } finally {
          setIsUploading(false)
          resolve()
        }
      }

      if (mediaRecorderRef.current!.state === 'recording') {
        mediaRecorderRef.current!.addEventListener('stop', doUpload, { once: true })
        mediaRecorderRef.current!.stop()
      } else {
        doUpload()
      }
    })
  }, [token])

  const handleInterviewComplete = useCallback(async () => {
    await uploadRecording()
    router.push(`/video-interview/${token}/submitted`)
  }, [uploadRecording, router, token])

  // ─── Start Interview ─────────────────────────────────────────────────────────

  const handleStartInterview = async () => {
    try {
      // Unlock AudioContext on user gesture (required by browsers)
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 16000 })
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      userStreamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Start video recording
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data)
      }
      recorder.start(1000)
      mediaRecorderRef.current = recorder

      // Setup AudioWorklet VAD
      const ctx = audioContextRef.current
      await ctx.audioWorklet.addModule('/worklets/vad-processor.js')
      const vadNode = new AudioWorkletNode(ctx, 'vad-processor')
      vadWorkletRef.current = vadNode

      // Connect mic → vad (NOT to destination, no echo)
      const micSource = ctx.createMediaStreamSource(stream)
      micSource.connect(vadNode)

      vadNode.port.onmessage = (e) => {
        const { type, data } = e.data

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

        if (type === 'end_of_speech') {
          wsRef.current?.send(JSON.stringify({ type: 'audio_end' }))
        }

        if (type === 'speech_start' && interviewStateRef.current === 'speaking') {
          // Barge-in
          drainTtsQueue()
          wsRef.current?.send(JSON.stringify({ type: 'barge_in' }))
        }
      }

      // Open WebSocket
      const wsUrl = getVideoInterviewWSUrl(token)
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

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
        if (s !== 'done' && s !== 'ready' && s !== 'loading') {
          setOverlayMessage({ text: 'Connection lost — reconnecting…', type: 'connection' })
        }
      }

      ws.onerror = (e) => {
        console.error('WS error:', e)
      }

    } catch (err) {
      console.error('Start interview error:', err)
      setError('Failed to start interview. Please check camera/microphone permissions.')
      setInterviewState('error')
    }
  }

  // ─── Device Toggles ──────────────────────────────────────────────────────────

  const toggleMic = () => {
    const newEnabled = !isMicOn
    setIsMicOn(newEnabled)
    userStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = newEnabled })
    wsRef.current?.send(JSON.stringify({ type: newEnabled ? 'mic_on' : 'mic_off' }))
  }

  const toggleCamera = () => {
    const newEnabled = !isCameraOn
    setIsCameraOn(newEnabled)
    userStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = newEnabled })
  }

  const handleEndInterview = async () => {
    if (!confirm('End the interview?')) return
    wsRef.current?.send(JSON.stringify({ type: 'disconnect' }))
    wsRef.current?.close()
    setInterviewState('done')
    await uploadRecording()
    router.push(`/video-interview/${token}/submitted`)
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      wsRef.current?.close()
      userStreamRef.current?.getTracks().forEach((t) => t.stop())
      audioContextRef.current?.close().catch(() => {})
    }
  }, [])

  // ─── Render ──────────────────────────────────────────────────────────────────

  const isActive = interviewState !== 'ready' && interviewState !== 'loading' && interviewState !== 'error'

  if (interviewState === 'loading') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#111111] text-white">
        <Loader2 className="h-10 w-10 text-white animate-spin mb-4" />
        <h2 className="text-lg font-medium">Connecting...</h2>
      </div>
    )
  }

  if (interviewState === 'error') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#111111] text-white p-6">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-medium mb-2">Interview Unavailable</h2>
        <p className="text-sm text-gray-400 max-w-sm text-center">{error}</p>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#111111] flex flex-col overflow-hidden relative font-sans">

      {/* Upload spinner overlay */}
      {isUploading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
            <p className="text-white text-sm font-medium">Saving your interview recording…</p>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="absolute top-0 w-full h-[72px] flex items-center justify-between px-6 z-30 pointer-events-none">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 backdrop-blur-md rounded-lg px-3 py-1.5 flex items-center gap-2 border border-white/5 pointer-events-auto">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-white text-sm font-medium tracking-wide">
              {candidate?.campaign_name || 'Interview Room'}
            </span>
          </div>
        </div>

        {/* Recording indicator */}
        {isActive && (
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">REC</span>
          </div>
        )}
      </header>

      {/* Main View Area */}
      <main className="flex-1 min-h-0 w-full flex items-center justify-center relative p-4 sm:p-8 pt-20 pb-28">
        <div className="w-full max-w-[1400px] self-stretch bg-[#1C1C1E] rounded-2xl md:rounded-[32px] overflow-hidden relative shadow-2xl border border-white/5">

          {/* VRM Avatar */}
          <div className={`absolute inset-0 transition-opacity duration-1000 ${interviewState === 'ready' ? 'opacity-0' : 'opacity-100'}`}>
            <VRMAvatar audioElement={null} />
          </div>

          {/* Status badge */}
          {isActive && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
              <span className={`rounded-full px-3 py-1 text-xs font-medium
                ${interviewState === 'listening' ? 'bg-emerald-900/80 text-emerald-300' :
                  interviewState === 'thinking' ? 'bg-amber-900/80 text-amber-300' :
                  (interviewState === 'speaking' || interviewState === 'engaging' || interviewState === 'greeting')
                    ? 'bg-indigo-900/80 text-indigo-300' :
                  'bg-slate-800/80 text-slate-400'}`}
              >
                {interviewState === 'listening' ? '● Listening' :
                 interviewState === 'thinking' ? '⏳ Thinking…' :
                 (interviewState === 'speaking' || interviewState === 'engaging' || interviewState === 'greeting') ? '◎ Speaking' : ''}
              </span>
            </div>
          )}

          {/* Engagement / connection overlay */}
          {overlayMessage && (
            <div className={`absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg
              ${overlayMessage.type === 'connection'
                ? 'bg-red-900/90 text-red-200 border border-red-700'
                : 'bg-amber-900/90 text-amber-200 border border-amber-700'}`}
            >
              {overlayMessage.type === 'mic_off' && <MicOff className="h-4 w-4 flex-shrink-0" />}
              {overlayMessage.text}
            </div>
          )}

          {/* Ready State — Join overlay */}
          {interviewState === 'ready' && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl z-20 flex flex-col items-center justify-center p-6 text-center">
              <UserCircle className="w-20 h-20 text-white/20 mb-6" />
              <h2 className="text-3xl font-semibold text-white mb-2">Ready to join?</h2>
              <p className="text-gray-400 mb-8 max-w-md">
                The interviewer is waiting in the room. Ensure your environment is quiet and well-lit.
              </p>
              <Button
                onClick={handleStartInterview}
                className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-6 rounded-full font-medium text-lg transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)]"
              >
                Join Interview
              </Button>
            </div>
          )}

          {/* Candidate PiP (bottom right) */}
          {isActive && (
            <div className="absolute bottom-6 right-6 w-32 aspect-[3/4] sm:w-48 sm:aspect-video bg-black rounded-xl overflow-hidden shadow-xl border border-white/10 ring-1 ring-black/50 z-20">
              <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md rounded px-2 py-0.5 text-xs text-white z-10 font-medium">
                You
              </div>
              {!isCameraOn ? (
                <div className="w-full h-full flex items-center justify-center bg-[#2C2C2E]">
                  <UserCircle className="w-12 h-12 text-white/20" />
                </div>
              ) : (
                <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />
              )}
              {!isMicOn && (
                <div className="absolute top-2 right-2 bg-red-500 rounded-full p-1 z-10 shadow-lg">
                  <MicOff className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
          )}

          {/* Collapsible transcript panel */}
          {isActive && (
            <div
              className={`absolute bottom-24 left-4 right-4 overflow-hidden rounded-xl bg-slate-900/90 backdrop-blur-sm border border-slate-700 transition-all duration-300 z-20 ${
                showTranscript ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="p-3">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">Transcript</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {transcriptEntries.map((entry, i) => (
                    <p key={i} className="text-sm leading-relaxed">
                      <span className={entry.role === 'ai' ? 'text-indigo-400' : 'text-slate-300'}>
                        {entry.role === 'ai' ? 'AI: ' : 'You: '}
                      </span>
                      <span className="text-slate-200">{entry.text}</span>
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Control Bar */}
      <div className={`absolute bottom-0 w-full h-[88px] flex items-center justify-center gap-4 z-30 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-500 ${
        interviewState === 'ready' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}>

        {/* Mic toggle */}
        <button
          onClick={toggleMic}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all
            ${isMicOn
              ? 'bg-[#3C4043] hover:bg-[#4d5156] text-white'
              : 'bg-[#EA4335] hover:bg-[#EA4335]/90 text-white'}`}
          aria-label={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
        >
          {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>

        {/* Camera toggle */}
        <button
          onClick={toggleCamera}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all
            ${isCameraOn
              ? 'bg-[#3C4043] hover:bg-[#4d5156] text-white'
              : 'bg-[#EA4335] hover:bg-[#EA4335]/90 text-white'}`}
          aria-label={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        <div className="w-px h-8 bg-white/10 mx-2" />

        {/* End interview */}
        <button
          onClick={handleEndInterview}
          className="px-6 h-14 rounded-full flex items-center gap-2 bg-[#EA4335] hover:bg-[#EA4335]/90 text-white font-medium transition-all shadow-lg"
          aria-label="End interview"
        >
          <PhoneOff className="w-5 h-5" />
          <span className="hidden sm:inline">End Interview</span>
        </button>

        {/* Transcript toggle */}
        <button
          onClick={() => setShowTranscript((v) => !v)}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all
            ${showTranscript
              ? 'bg-indigo-600 hover:bg-indigo-700 border border-indigo-500'
              : 'bg-[#3C4043] hover:bg-[#4d5156]'} text-white`}
          aria-label="Toggle transcript"
        >
          <MessageSquare className="w-5 h-5" />
        </button>
      </div>

    </div>
  )
}
