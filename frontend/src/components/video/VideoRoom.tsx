'use client'

import { useEffect, useState } from 'react'
import { useDaily, useParticipantIds, useLocalParticipant, useDevices } from '@daily-co/daily-react'
import { ParticipantGrid } from './ParticipantGrid'
import { VideoControls } from './VideoControls'
import { Loader2, Wifi, WifiOff } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface VideoRoomProps {
  interviewId: string
  onLeave?: () => void
}

export function VideoRoom({ interviewId, onLeave }: VideoRoomProps) {
  const daily = useDaily()
  const participantIds = useParticipantIds()
  const localParticipant = useLocalParticipant()
  const { microphones, cameras } = useDevices()

  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connected')

  useEffect(() => {
    if (!daily) return

    // Listen for connection state changes
    const handleJoinedMeeting = () => {
      setConnectionStatus('connected')
    }

    const handleLeftMeeting = () => {
      setConnectionStatus('disconnected')
    }

    const handleError = (error: any) => {
      console.error('Daily error:', error)
      setConnectionStatus('disconnected')
    }

    daily.on('joined-meeting', handleJoinedMeeting)
    daily.on('left-meeting', handleLeftMeeting)
    daily.on('error', handleError)

    return () => {
      daily.off('joined-meeting', handleJoinedMeeting)
      daily.off('left-meeting', handleLeftMeeting)
      daily.off('error', handleError)
    }
  }, [daily])

  const handleToggleAudio = async () => {
    if (!daily) return
    try {
      await daily.setLocalAudio(!isAudioEnabled)
      setIsAudioEnabled(!isAudioEnabled)
    } catch (error) {
      console.error('Error toggling audio:', error)
    }
  }

  const handleToggleVideo = async () => {
    if (!daily) return
    try {
      await daily.setLocalVideo(!isVideoEnabled)
      setIsVideoEnabled(!isVideoEnabled)
    } catch (error) {
      console.error('Error toggling video:', error)
    }
  }

  const handleToggleScreenShare = async () => {
    if (!daily) return
    try {
      if (!isScreenSharing) {
        await daily.startScreenShare()
        setIsScreenSharing(true)
      } else {
        await daily.stopScreenShare()
        setIsScreenSharing(false)
      }
    } catch (error) {
      console.error('Error toggling screen share:', error)
    }
  }

  const handleLeave = async () => {
    if (!daily) return
    try {
      await daily.leave()
      if (onLeave) {
        onLeave()
      }
    } catch (error) {
      console.error('Error leaving room:', error)
    }
  }

  if (connectionStatus === 'connecting') {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-12 pb-12 px-8">
            <div className="text-center">
              <Loader2 className="h-16 w-16 animate-spin text-cyan-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                Connecting to interview room...
              </h3>
              <p className="text-slate-400">
                Please wait while we set up your video session
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (connectionStatus === 'disconnected') {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-12 pb-12 px-8">
            <div className="text-center">
              <WifiOff className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                Connection Lost
              </h3>
              <p className="text-slate-400 mb-6">
                Unable to connect to the interview room. Please check your internet connection.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
              >
                Retry Connection
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-sm text-slate-300">Live Interview</span>
            </div>
            <div className="h-4 w-px bg-slate-600"></div>
            <span className="text-sm text-slate-400">
              {participantIds.length} participant{participantIds.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-green-500" />
            <span className="text-xs text-slate-400">Connected</span>
          </div>
        </div>
      </div>

      {/* Video Grid */}
      <div className="flex-1 overflow-hidden">
        <ParticipantGrid participantIds={participantIds} />
      </div>

      {/* Controls */}
      <div className="bg-slate-800 border-t border-slate-700 px-6 py-4">
        <VideoControls
          isAudioEnabled={isAudioEnabled}
          isVideoEnabled={isVideoEnabled}
          isScreenSharing={isScreenSharing}
          onToggleAudio={handleToggleAudio}
          onToggleVideo={handleToggleVideo}
          onToggleScreenShare={handleToggleScreenShare}
          onLeave={handleLeave}
        />
      </div>

      {/* Participant Info (for debugging) */}
      {localParticipant && (
        <div className="absolute top-20 right-4 bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs text-slate-300">
          <p className="font-semibold mb-1">You: {localParticipant.user_name}</p>
          <p>Session: {localParticipant.session_id}</p>
        </div>
      )}
    </div>
  )
}
