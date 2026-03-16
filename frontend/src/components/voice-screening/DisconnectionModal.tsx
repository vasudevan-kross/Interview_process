'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

interface DisconnectionModalProps {
  isOpen: boolean
  onReconnect: () => Promise<void>
  onEndCall: () => void
  reconnectTimeoutSeconds?: number
}

export function DisconnectionModal({
  isOpen,
  onReconnect,
  onEndCall,
  reconnectTimeoutSeconds = 30
}: DisconnectionModalProps) {
  const [reconnecting, setReconnecting] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(reconnectTimeoutSeconds)
  const [reconnectError, setReconnectError] = useState<string | null>(null)

  // Countdown timer
  useEffect(() => {
    if (!isOpen) {
      setTimeRemaining(reconnectTimeoutSeconds)
      setReconnectError(null)
      return
    }

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          handleAutoTimeout()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isOpen, reconnectTimeoutSeconds])

  async function handleReconnect() {
    setReconnecting(true)
    setReconnectError(null)

    try {
      await onReconnect()
      // If successful, modal will be closed by parent
    } catch (error: any) {
      console.error('Reconnection failed:', error)
      setReconnectError(error.message || 'Failed to reconnect. Please try again.')
    } finally {
      setReconnecting(false)
    }
  }

  function handleAutoTimeout() {
    console.log('[DisconnectionModal] Reconnection timeout - ending call')
    onEndCall()
  }

  const progressPercentage = ((reconnectTimeoutSeconds - timeRemaining) / reconnectTimeoutSeconds) * 100

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-yellow-100">
              <AlertCircle className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <DialogTitle className="text-xl text-slate-900">
                Microphone Disconnected
              </DialogTitle>
              <DialogDescription className="text-slate-600">
                Your microphone was disconnected during the interview
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Countdown Timer */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600">Time remaining:</span>
              <span className="font-mono font-semibold text-slate-900">
                {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
              </span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>

          {/* Instructions */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2">
            <p className="text-sm font-medium text-slate-900">What to do:</p>
            <ol className="text-sm text-slate-700 space-y-1 ml-4 list-decimal">
              <li>Check if your microphone is plugged in</li>
              <li>Make sure no other app is using the microphone</li>
              <li>Click "Try to Reconnect" below</li>
            </ol>
          </div>

          {/* Error message */}
          {reconnectError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-800">{reconnectError}</p>
            </div>
          )}

          {/* Auto-timeout warning */}
          {timeRemaining <= 10 && !reconnecting && (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
              <p className="text-sm text-yellow-800">
                ⚠️ Call will end automatically in {timeRemaining} second{timeRemaining !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            onClick={handleReconnect}
            disabled={reconnecting || timeRemaining === 0}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700"
          >
            {reconnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reconnecting...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Try to Reconnect
              </>
            )}
          </Button>
          <Button
            onClick={onEndCall}
            variant="outline"
            disabled={reconnecting}
            className="flex-1"
          >
            End Interview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
