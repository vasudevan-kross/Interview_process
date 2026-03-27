'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Camera, Monitor, CheckCircle, AlertCircle, ArrowRight, VideoOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Step = 'intro' | 'checking' | 'ready' | 'error'

interface PermissionStatus {
  camera: 'unchecked' | 'granted' | 'denied' | 'unavailable'
  screen: 'unchecked' | 'granted' | 'denied' | 'skipped'
}

export default function CameraSetupPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [step, setStep] = useState<Step>('intro')
  const [perms, setPerms] = useState<PermissionStatus>({
    camera: 'unchecked',
    screen: 'unchecked',
  })
  const [error, setError] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const previewRef = useRef<HTMLVideoElement>(null)
  const previewStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    setIsMobile(/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent))
  }, [])

  // Cleanup preview stream on unmount
  useEffect(() => {
    return () => {
      previewStreamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const handleStartSetup = async () => {
    setStep('checking')
    setError(null)

    // --- Camera check ---
    let cameraGranted = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      previewStreamRef.current = stream
      if (previewRef.current) {
        previewRef.current.srcObject = stream
      }
      cameraGranted = true
      setPerms((p) => ({ ...p, camera: 'granted' }))
    } catch (err: any) {
      if (err?.name === 'NotFoundError') {
        setPerms((p) => ({ ...p, camera: 'unavailable' }))
      } else {
        setPerms((p) => ({ ...p, camera: 'denied' }))
      }
    }

    // --- Screen check (desktop only) ---
    if (!isMobile) {
      try {
        const screen = await (navigator.mediaDevices as any).getDisplayMedia({
          video: { frameRate: { ideal: 5 } },
        })
        // Stop immediately — just checking permission
        screen.getTracks().forEach((t: MediaStreamTrack) => t.stop())
        setPerms((p) => ({ ...p, screen: 'granted' }))
      } catch {
        setPerms((p) => ({ ...p, screen: 'denied' }))
      }
    } else {
      setPerms((p) => ({ ...p, screen: 'skipped' }))
    }

    setStep('ready')
  }

  const handleContinue = () => {
    // Mark setup complete in sessionStorage
    sessionStorage.setItem(`video_setup_${token}`, 'completed')
    // Stop preview stream before leaving
    previewStreamRef.current?.getTracks().forEach((t) => t.stop())
    router.push(`/interview/${token}`)
  }

  const handleSkip = () => {
    sessionStorage.setItem(`video_setup_${token}`, 'skipped')
    previewStreamRef.current?.getTracks().forEach((t) => t.stop())
    router.push(`/interview/${token}`)
  }

  const statusIcon = (s: string) => {
    if (s === 'granted') return <CheckCircle className="h-5 w-5 text-green-400" />
    if (s === 'denied') return <AlertCircle className="h-5 w-5 text-yellow-400" />
    if (s === 'unavailable') return <VideoOff className="h-5 w-5 text-gray-500" />
    if (s === 'skipped') return <span className="text-xs text-gray-500">N/A</span>
    return <div className="h-5 w-5 rounded-full border border-white/20 animate-pulse bg-white/10" />
  }

  const statusLabel = (s: string) => {
    if (s === 'granted') return 'Ready'
    if (s === 'denied') return 'Denied — click Allow when prompted'
    if (s === 'unavailable') return 'No camera found'
    if (s === 'skipped') return 'Not required on mobile'
    return 'Checking…'
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="h-14 w-14 mx-auto bg-[#00E5FF]/10 border border-[#00E5FF]/30 flex items-center justify-center rounded-sm">
            <Camera className="h-7 w-7 text-[#00E5FF]" />
          </div>
          <h1 className="text-2xl font-bold uppercase tracking-widest">Camera Setup</h1>
          <p className="text-gray-400 text-sm">
            This assessment uses video proctoring. We'll check your camera and optionally your screen.
          </p>
        </div>

        {/* Intro step */}
        {step === 'intro' && (
          <div className="space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-sm p-5 space-y-3">
              <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">What will be recorded</p>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-[#00E5FF] shrink-0" />
                  Your front camera throughout the assessment
                </li>
                {!isMobile && (
                  <li className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-[#00E5FF] shrink-0" />
                    Your screen activity (you choose which window/tab)
                  </li>
                )}
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                onClick={handleStartSetup}
                className="w-full h-12 bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-black font-bold rounded-sm uppercase tracking-widest"
              >
                Check Camera &amp; Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <button
                onClick={handleSkip}
                className="text-sm text-gray-500 hover:text-gray-300 underline underline-offset-4 transition-colors"
              >
                Skip — proceed without video proctoring
              </button>
            </div>
          </div>
        )}

        {/* Checking / Ready step */}
        {(step === 'checking' || step === 'ready') && (
          <div className="space-y-6">
            {/* Camera preview */}
            <div className="relative aspect-video bg-black rounded-sm overflow-hidden border border-white/10">
              <video
                ref={previewRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {perms.camera !== 'granted' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <VideoOff className="h-10 w-10 text-gray-600" />
                </div>
              )}
            </div>

            {/* Permission status rows */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-sm">
                <div className="flex items-center gap-3">
                  <Camera className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium">Webcam</p>
                    <p className="text-xs text-gray-500">{statusLabel(perms.camera)}</p>
                  </div>
                </div>
                {statusIcon(perms.camera)}
              </div>

              {!isMobile && (
                <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-sm">
                  <div className="flex items-center gap-3">
                    <Monitor className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">Screen Recording</p>
                      <p className="text-xs text-gray-500">{statusLabel(perms.screen)}</p>
                    </div>
                  </div>
                  {statusIcon(perms.screen)}
                </div>
              )}
            </div>

            {step === 'ready' && (
              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleContinue}
                  className="w-full h-12 bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-black font-bold rounded-sm uppercase tracking-widest"
                >
                  Start Assessment
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                {(perms.camera === 'denied' || perms.screen === 'denied') && (
                  <p className="text-xs text-center text-yellow-400/80">
                    Some permissions were denied. The interview will continue — recording may be incomplete.
                  </p>
                )}
                <button
                  onClick={handleSkip}
                  className="text-sm text-gray-500 hover:text-gray-300 underline underline-offset-4 transition-colors"
                >
                  Skip video proctoring
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
