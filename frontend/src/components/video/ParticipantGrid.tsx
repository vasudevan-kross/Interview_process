'use client'

import { useVideoTrack, useAudioTrack, useParticipant, useScreenShare } from '@daily-co/daily-react'
import { Mic, MicOff, User, Monitor } from 'lucide-react'
import DailyIframe from '@daily-co/daily-js'

interface ParticipantGridProps {
  participantIds: string[]
}

export function ParticipantGrid({ participantIds }: ParticipantGridProps) {
  const getGridCols = () => {
    const count = participantIds.length
    if (count === 0) return 'grid-cols-1'
    if (count <= 2) return 'grid-cols-1 md:grid-cols-2'
    if (count <= 4) return 'grid-cols-2'
    if (count <= 6) return 'grid-cols-2 md:grid-cols-3'
    return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
  }

  if (participantIds.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <User className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">Waiting for participants to join...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`grid ${getGridCols()} gap-4 p-4 h-full`}>
      {participantIds.map((participantId) => (
        <VideoTile key={participantId} participantId={participantId} />
      ))}
    </div>
  )
}

interface VideoTileProps {
  participantId: string
}

function VideoTile({ participantId }: VideoTileProps) {
  const videoTrack = useVideoTrack(participantId)
  const audioTrack = useAudioTrack(participantId)
  const participant = useParticipant(participantId)
  const { screens } = useScreenShare()

  const isLocal = participant?.local || false
  const isVideoOn = Boolean(videoTrack.persistentTrack)
  const isAudioOn = Boolean(audioTrack.persistentTrack)
  const isScreenSharing = screens.some((screen: any) => screen.session_id === participantId)

  return (
    <div className="relative bg-slate-800 rounded-lg overflow-hidden aspect-video flex items-center justify-center border-2 border-slate-700 hover:border-cyan-600 transition-colors">
      {/* Video Element */}
      {isVideoOn && videoTrack.persistentTrack ? (
        <video
          autoPlay
          muted={isLocal}
          playsInline
          ref={(el) => {
            if (el && videoTrack.persistentTrack) {
              el.srcObject = new MediaStream([videoTrack.persistentTrack])
            }
          }}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="flex items-center justify-center w-full h-full bg-gradient-to-br from-slate-700 to-slate-800">
          <div className="h-20 w-20 rounded-full bg-cyan-600 flex items-center justify-center text-white text-3xl font-bold">
            {participant?.user_name?.charAt(0).toUpperCase() || 'U'}
          </div>
        </div>
      )}

      {/* Participant Info Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium text-sm truncate max-w-[150px]">
              {participant?.user_name || 'Participant'}
              {isLocal && ' (You)'}
            </span>
            {isScreenSharing && (
              <Monitor className="h-3 w-3 text-cyan-400" />
            )}
          </div>
          <div className="flex items-center gap-2">
            {participant?.owner && (
              <span className="text-xs text-slate-300 bg-slate-700/50 px-2 py-0.5 rounded">
                Host
              </span>
            )}
            {isAudioOn ? (
              <Mic className="h-4 w-4 text-green-400" />
            ) : (
              <MicOff className="h-4 w-4 text-red-400" />
            )}
          </div>
        </div>
      </div>

      {/* Speaking Indicator */}
      {isAudioOn && (
        <div className="absolute top-2 left-2">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
        </div>
      )}

      {/* Local Peer Indicator */}
      {isLocal && (
        <div className="absolute top-2 right-2 bg-cyan-600 text-white text-xs px-2 py-1 rounded">
          YOU
        </div>
      )}
    </div>
  )
}
