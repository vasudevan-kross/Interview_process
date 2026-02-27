'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { DailyProvider, useDaily, useDevices } from '@daily-co/daily-react'
import DailyIframe from '@daily-co/daily-js'
import { VideoRoom } from '@/components/video/VideoRoom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

export default function LiveInterviewPage() {
  const [callObject, setCallObject] = useState<any>(null)

  useEffect(() => {
    // Create Daily call object
    const daily = DailyIframe.createCallObject()
    setCallObject(daily)

    return () => {
      if (daily) {
        daily.destroy()
      }
    }
  }, [])

  if (!callObject) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-cyan-500" />
      </div>
    )
  }

  return (
    <DailyProvider callObject={callObject}>
      <LiveInterviewContent />
    </DailyProvider>
  )
}

function LiveInterviewContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const interviewId = params?.interviewId as string
  const token = searchParams?.get('token')

  const daily = useDaily()
  const { currentCam, currentMic } = useDevices()
  const [joining, setJoining] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Prevent accidental page close during interview
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      setError('No join token provided. Please use the join link from your invitation.')
      setJoining(false)
      return
    }

    if (!interviewId) {
      setError('Invalid interview ID.')
      setJoining(false)
      return
    }

    if (daily) {
      joinRoom()
    }

    return () => {
      // Cleanup: leave room when component unmounts
      if (daily) {
        daily.leave().catch(console.error)
      }
    }
  }, [token, interviewId, daily])

  const joinRoom = async () => {
    if (!daily || !token) return

    try {
      setJoining(true)
      setError(null)

      // Request camera and microphone permissions
      try {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      } catch (permError: any) {
        throw new Error('Camera and microphone access denied. Please allow access and try again.')
      }

      // Join the Daily.co room
      // Token format is expected to be the meeting token from backend
      await daily.join({ token })

      setJoining(false)
      toast.success('Successfully joined the interview!')
    } catch (err: any) {
      console.error('Error joining room:', err)
      let errorMessage = 'Failed to join the interview room. '

      if (err.message.includes('access denied') || err.message.includes('NotAllowedError')) {
        errorMessage = 'Please allow camera and microphone access and try again.'
      } else if (err.message.includes('NotFoundError')) {
        errorMessage = 'No camera or microphone found on this device.'
      } else if (err.message.includes('token')) {
        errorMessage = 'Invalid or expired invitation link. Please request a new link.'
      } else if (err.message) {
        errorMessage = err.message
      } else {
        errorMessage += 'Please check your connection and try again.'
      }

      setError(errorMessage)
      setJoining(false)
      toast.error(errorMessage)
    }
  }

  const handleLeave = () => {
    router.push(`/dashboard/video-interviews/${interviewId}`)
  }

  const handleRetry = () => {
    setError(null)
    joinRoom()
  }

  if (joining) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-12 pb-12 px-8">
            <div className="text-center">
              <Loader2 className="h-16 w-16 animate-spin text-cyan-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                Joining interview...
              </h3>
              <p className="text-slate-400 mb-4">
                Please allow camera and microphone access when prompted
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                <div className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse"></div>
                <span>Connecting to video server</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center p-4">
        <Card className="bg-slate-800 border-slate-700 max-w-md w-full">
          <CardContent className="pt-12 pb-12 px-8">
            <div className="text-center">
              <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                Unable to Join Interview
              </h3>
              <p className="text-slate-400 mb-6">{error}</p>
              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleRetry}
                  className="bg-cyan-600 hover:bg-cyan-700"
                >
                  Try Again
                </Button>
                <Button
                  variant="outline"
                  onClick={handleLeave}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Interview Details
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <VideoRoom interviewId={interviewId} onLeave={handleLeave} />
}
