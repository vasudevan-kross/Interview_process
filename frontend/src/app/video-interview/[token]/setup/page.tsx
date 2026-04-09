'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getVideoCandidateByToken } from '@/lib/api/video-interviews'
import { Camera, Mic, Sun, Wifi, ArrowRight, AlertCircle, Video } from 'lucide-react'

export default function VideoInterviewSetupPage() {
  const router = useRouter()
  const params = useParams()
  const token = params?.token as string
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [checking, setChecking] = useState(true)
  const [linkStatus, setLinkStatus] = useState<'checking' | 'valid' | 'completed' | 'expired' | 'error'>('checking')

  useEffect(() => {
    const init = async () => {
      try {
        if (token) {
          const data = await getVideoCandidateByToken(token)
          if (data.status === 'completed') {
            setLinkStatus('completed')
            setChecking(false)
            return
          }
          if (data.status === 'failed') {
            setLinkStatus('expired')
            setError('This interview link has expired.')
            setChecking(false)
            return
          }
        }
        setLinkStatus('valid')
      } catch {
        setLinkStatus('error')
        setError('Interview link is invalid or expired.')
        setChecking(false)
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setReady(true)
      } catch {
        setError('Camera and microphone access are required to continue.')
      } finally {
        setChecking(false)
      }
    }
    init()
  }, [])

  const handleContinue = () => {
    sessionStorage.setItem('videoInterviewSetupComplete', 'true')
    router.push(`/video-interview/${token}`)
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white selection:bg-[#00E5FF]/30">
      <div className="mx-auto max-w-5xl px-6 py-12 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">
          
          {/* Left side: Instructions */}
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#00E5FF]/10 border border-[#00E5FF]/20">
                <Video className="h-6 w-6 text-[#00E5FF]" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white lg:text-5xl">
                Let&apos;s get you set up
              </h1>
              <p className="text-base text-gray-400 leading-relaxed max-w-md">
                We need to check your camera and microphone before the interview begins. Ensure you&apos;re in a quiet space with stable internet.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-md">
              <h3 className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-5">Preparation Checklist</h3>
              <ul className="space-y-4 text-sm text-gray-300">
                <li className="flex items-center gap-3">
                  <Sun className="h-5 w-5 text-[#00E5FF]" /> Quiet space with good lighting
                </li>
                <li className="flex items-center gap-3">
                  <Wifi className="h-5 w-5 text-[#00E5FF]" /> Stable internet connection
                </li>
                <li className="flex items-center gap-3">
                  <Camera className="h-5 w-5 text-[#00E5FF]" /> Camera centered at eye level
                </li>
              </ul>
            </div>

            {/* Camera-required notice */}
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
              <Camera className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-300/90 leading-relaxed">
                <span className="font-semibold">Camera must stay on</span> throughout the interview. Turning it off during the session is not permitted.
              </p>
            </div>
          </div>

          {/* Right side: Video frame & Action */}
          <div className="space-y-6">
            {linkStatus === 'completed' ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-10 text-center backdrop-blur-md">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
                  <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white">Interview Completed</h3>
                <p className="mt-2 text-sm text-emerald-200/70">You have already submitted your interview. Thank you for your time — we will be in touch soon.</p>
              </div>
            ) : linkStatus === 'expired' || linkStatus === 'error' ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center backdrop-blur-md">
                <AlertCircle className="mx-auto h-10 w-10 text-red-400 mb-4" />
                <h3 className="text-lg font-medium text-white">Interview link {linkStatus === 'error' ? 'invalid' : 'expired'}</h3>
                <p className="mt-2 text-sm text-red-200/70">Please contact the hiring team for assistance.</p>
              </div>
            ) : (
              <div className="relative rounded-2xl border border-white/10 bg-black/50 overflow-hidden shadow-2xl ring-1 ring-white/5">
                <div className="aspect-[4/3] w-full bg-[#111]">
                  <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                </div>
                
                {/* Overlay indicators */}
                <div className="absolute bottom-4 left-4 flex gap-2">
                  <div className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-white border border-white/10">
                    <Camera className="h-3.5 w-3.5 text-[#00E5FF]" /> Ready
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-white border border-white/10">
                    <Mic className="h-3.5 w-3.5 text-[#00E5FF]" /> Ready
                  </div>
                </div>

                {error && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-8 text-center backdrop-blur-md">
                    <div className="space-y-3">
                      <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
                      <p className="text-sm font-medium text-red-400">{error}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <Button 
              onClick={handleContinue} 
              disabled={!ready || checking || linkStatus !== 'valid'} 
              className="w-full h-14 bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-black font-bold text-base rounded-xl transition-all shadow-[0_0_20px_rgba(0,229,255,0.15)] hover:shadow-[0_0_30px_rgba(0,229,255,0.3)] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none uppercase tracking-wide"
            >
              {checking ? 'Checking environment...' : 'I\'m Ready, Let\'s Go'}
              {!checking && <ArrowRight className="ml-2 h-5 w-5" />}
            </Button>
          </div>

        </div>
      </div>
    </div>
  )
}

