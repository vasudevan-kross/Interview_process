'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, PhoneOff } from 'lucide-react'

interface VideoControlsProps {
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isScreenSharing: boolean
  onToggleAudio: () => void
  onToggleVideo: () => void
  onToggleScreenShare: () => void
  onLeave: () => void
}

export function VideoControls({
  isAudioEnabled,
  isVideoEnabled,
  isScreenSharing,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onLeave,
}: VideoControlsProps) {
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)

  const handleLeaveWithConfirm = () => {
    setLeaveDialogOpen(true)
  }

  return (
    <>
      <div className="flex items-center justify-center gap-3">
        {/* Audio Control */}
        <Button
          onClick={onToggleAudio}
          size="lg"
          className={`rounded-full h-14 w-14 ${isAudioEnabled
              ? 'bg-slate-700 hover:bg-slate-600'
              : 'bg-red-600 hover:bg-red-700'
            }`}
          title={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
        >
          {isAudioEnabled ? (
            <Mic className="h-5 w-5" />
          ) : (
            <MicOff className="h-5 w-5" />
          )}
        </Button>

        {/* Video Control */}
        <Button
          onClick={onToggleVideo}
          size="lg"
          className={`rounded-full h-14 w-14 ${isVideoEnabled
              ? 'bg-slate-700 hover:bg-slate-600'
              : 'bg-red-600 hover:bg-red-700'
            }`}
          title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {isVideoEnabled ? (
            <Video className="h-5 w-5" />
          ) : (
            <VideoOff className="h-5 w-5" />
          )}
        </Button>

        {/* Screen Share Control */}
        <Button
          onClick={onToggleScreenShare}
          size="lg"
          className={`rounded-full h-14 w-14 ${isScreenSharing
              ? 'bg-cyan-600 hover:bg-cyan-700'
              : 'bg-slate-700 hover:bg-slate-600'
            }`}
          title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
        >
          {isScreenSharing ? (
            <MonitorOff className="h-5 w-5" />
          ) : (
            <Monitor className="h-5 w-5" />
          )}
        </Button>

        {/* Divider */}
        <div className="h-10 w-px bg-slate-600 mx-2"></div>

        {/* Leave Button */}
        <Button
          onClick={handleLeaveWithConfirm}
          size="lg"
          className="rounded-full h-14 w-14 bg-red-600 hover:bg-red-700"
          title="Leave interview"
        >
          <PhoneOff className="h-5 w-5" />
        </Button>

        {/* Control Labels (visible on larger screens) */}
        <div className="hidden lg:flex items-center gap-4 ml-6">
          <div className="text-xs text-slate-400">
            <p className="font-medium">Controls</p>
            <p>Click to toggle audio/video</p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
        onConfirm={onLeave}
        title="Leave Interview"
        description="Are you sure you want to leave the interview? You won't be able to rejoin."
        confirmText="Leave"
        variant="destructive"
      />
    </>
  )
}
