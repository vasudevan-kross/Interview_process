'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Mic, CheckCircle2, AlertTriangle } from 'lucide-react'
import { AudioLevelVisualizer } from './AudioLevelVisualizer'
import { DeviceSelector } from './DeviceSelector'
import { BrowserPermissionGuide } from './BrowserPermissionGuide'
import {
  isMediaDevicesSupported,
  requestMicrophoneAccess,
  getAudioInputDevices,
  requestSpecificDevice,
  classifyMicrophoneError,
  stopMediaStream,
  AudioDevice,
  MicrophoneErrorType
} from '@/lib/utils/mediaDevices'

type SetupState =
  | 'idle'
  | 'requesting_permission'
  | 'testing_audio'
  | 'ready'
  | 'error'

interface MicrophoneSetupProps {
  onComplete: () => void
  onSkip?: () => void
}

export function MicrophoneSetup({ onComplete, onSkip }: MicrophoneSetupProps) {
  const [state, setState] = useState<SetupState>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [hasDetectedAudio, setHasDetectedAudio] = useState(false)
  const [silenceWarning, setSilenceWarning] = useState(false)
  const [errorType, setErrorType] = useState<MicrophoneErrorType | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  // Check browser support on mount
  useEffect(() => {
    if (!isMediaDevicesSupported()) {
      setState('error')
      setErrorType('unsupported')
      setErrorMessage('Your browser does not support microphone access.')
    }
  }, [])

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stopMediaStream(stream)
      }
    }
  }, [stream])

  async function handleStartTest() {
    setState('requesting_permission')
    setErrorType(null)
    setErrorMessage('')

    try {
      // Request microphone access
      const newStream = await requestMicrophoneAccess()
      setStream(newStream)

      // Get available devices
      const audioDevices = await getAudioInputDevices()
      setDevices(audioDevices)

      // Set selected device (first one by default)
      if (audioDevices.length > 0) {
        const firstDevice = audioDevices[0]
        setSelectedDeviceId(firstDevice.deviceId)
      }

      setState('testing_audio')
    } catch (error) {
      const micError = classifyMicrophoneError(error)
      setState('error')
      setErrorType(micError.type)
      setErrorMessage(micError.message)

      // Stop any stream that might have started
      if (stream) {
        stopMediaStream(stream)
        setStream(null)
      }
    }
  }

  async function handleDeviceChange(deviceId: string) {
    setSelectedDeviceId(deviceId)
    setHasDetectedAudio(false)
    setSilenceWarning(false)

    // Stop current stream
    if (stream) {
      stopMediaStream(stream)
    }

    try {
      // Request new stream with selected device
      const newStream = await requestSpecificDevice(deviceId)
      setStream(newStream)
      setState('testing_audio')
    } catch (error) {
      const micError = classifyMicrophoneError(error)
      setState('error')
      setErrorType(micError.type)
      setErrorMessage(micError.message)
      setStream(null)
    }
  }

  function handleAudioDetected() {
    setHasDetectedAudio(true)
    setSilenceWarning(false)
    setState('ready')

    // Store completion in sessionStorage to prevent re-testing
    sessionStorage.setItem('micSetupCompleted', 'true')
  }

  function handleSilenceDetected() {
    setSilenceWarning(true)
  }

  function handleRetry() {
    setState('idle')
    setErrorType(null)
    setErrorMessage('')
    setSilenceWarning(false)
    setHasDetectedAudio(false)

    if (stream) {
      stopMediaStream(stream)
      setStream(null)
    }
  }

  function handleContinue() {
    // Store device preference
    if (selectedDeviceId) {
      sessionStorage.setItem('preferredMicDeviceId', selectedDeviceId)
    }

    onComplete()
  }

  function handleSkipSetup() {
    sessionStorage.setItem('micSetupSkipped', 'true')
    onSkip?.()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <Card className="w-full max-w-2xl border-slate-700 bg-slate-800/50 backdrop-blur-sm">
        <CardHeader className="space-y-1 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-600">
              <Mic className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-2xl text-white">Microphone Setup</CardTitle>
              <CardDescription className="text-slate-400">
                Let's make sure your microphone is working properly
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Idle State */}
          {state === 'idle' && (
            <div className="space-y-4">
              <div className="p-6 rounded-lg bg-slate-900/50 border border-slate-700 text-center space-y-3">
                <Mic className="h-12 w-12 text-slate-400 mx-auto" />
                <p className="text-sm text-slate-300">
                  Click the button below to test your microphone. You'll be asked to allow microphone access.
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleStartTest}
                  size="lg"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  <Mic className="mr-2 h-5 w-5" />
                  Start Microphone Test
                </Button>
                {onSkip && (
                  <Button
                    onClick={handleSkipSetup}
                    variant="outline"
                    size="lg"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    Skip
                  </Button>
                )}
              </div>

              {onSkip && (
                <p className="text-xs text-center text-slate-500">
                  ⚠️ Skipping setup may result in call failures if your microphone isn't working
                </p>
              )}
            </div>
          )}

          {/* Requesting Permission State */}
          {state === 'requesting_permission' && (
            <div className="space-y-4">
              <div className="p-8 rounded-lg bg-slate-900/50 border border-slate-700 text-center space-y-4">
                <Loader2 className="h-12 w-12 text-indigo-500 mx-auto animate-spin" />
                <div className="space-y-2">
                  <p className="text-base text-white font-medium">
                    Please allow microphone access
                  </p>
                  <p className="text-sm text-slate-400">
                    Your browser will prompt you for permission. Click "Allow" to continue.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Testing Audio State */}
          {state === 'testing_audio' && (
            <div className="space-y-5">
              <div className="p-5 rounded-lg bg-slate-900/50 border border-slate-700 space-y-4">
                <AudioLevelVisualizer
                  stream={stream}
                  onAudioDetected={handleAudioDetected}
                  onSilenceDetected={handleSilenceDetected}
                />

                {silenceWarning && !hasDetectedAudio && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 text-sm">
                      <p className="font-medium text-yellow-300">We can't hear you</p>
                      <p className="text-yellow-400/80 text-xs mt-1">
                        Check if your microphone is muted or try selecting a different microphone below.
                      </p>
                    </div>
                  </div>
                )}

                <DeviceSelector
                  devices={devices}
                  selectedDeviceId={selectedDeviceId}
                  onDeviceChange={handleDeviceChange}
                />
              </div>

              <Button
                onClick={handleRetry}
                variant="outline"
                size="sm"
                className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                Start Over
              </Button>
            </div>
          )}

          {/* Ready State */}
          {state === 'ready' && (
            <div className="space-y-4">
              <div className="p-6 rounded-lg bg-green-500/10 border-2 border-green-500/30 text-center space-y-3">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                <div className="space-y-1">
                  <p className="text-base font-semibold text-green-300">
                    Microphone is working!
                  </p>
                  <p className="text-sm text-green-400/80">
                    You're all set. Click continue to start your interview.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleContinue}
                  size="lg"
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  Continue to Interview
                </Button>
                <Button
                  onClick={handleRetry}
                  variant="outline"
                  size="lg"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  Test Again
                </Button>
              </div>
            </div>
          )}

          {/* Error State */}
          {state === 'error' && errorType && (
            <div className="space-y-4">
              <BrowserPermissionGuide
                errorType={errorType}
                message={errorMessage}
              />

              <div className="flex gap-3">
                <Button
                  onClick={handleRetry}
                  size="lg"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  Try Again
                </Button>
                {onSkip && (
                  <Button
                    onClick={handleSkipSetup}
                    variant="outline"
                    size="lg"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    Skip Anyway
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
