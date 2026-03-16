'use client'

import { useRouter, useParams } from 'next/navigation'
import { MicrophoneSetup } from '@/components/voice-screening/MicrophoneSetup'

export default function MicrophoneSetupPage() {
  const router = useRouter()
  const params = useParams()
  const token = params.token as string

  function handleComplete() {
    // Mark setup as completed and redirect to interview
    sessionStorage.setItem('micSetupCompleted', 'true')
    router.push(`/voice-interview/${token}`)
  }

  // No skip option - microphone is mandatory for voice interviews
  return <MicrophoneSetup onComplete={handleComplete} />
}
