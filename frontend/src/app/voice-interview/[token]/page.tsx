'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getCandidateByToken, startCall, fetchCallData, type VoiceCandidatePublic } from '@/lib/api/voice-screening'
import { Phone, Mic, MicOff, Loader2, CheckCircle, AlertCircle, WifiOff, MicOff as MicOffIcon } from 'lucide-react'
import Vapi from '@vapi-ai/web'
import { DisconnectionModal } from '@/components/voice-screening/DisconnectionModal'

const VAPI_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || ''
const VAPI_ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID || ''

type ErrorType = 'mic_denied' | 'mic_not_found' | 'mic_disconnected' | 'network' | 'generic'

function classifyError(err: any): ErrorType {
    const msg = (err?.message || err?.error?.message || JSON.stringify(err) || '').toLowerCase()

    // Microphone permission denied
    if (msg.includes('permission') || msg.includes('notallowederror') || msg.includes('not allowed')
        || msg.includes('denied') || msg.includes('dismissed the prompt')) {
        return 'mic_denied'
    }

    // Microphone disconnected during call
    if (msg.includes('device') && (msg.includes('disconnect') || msg.includes('removed') || msg.includes('unplugged'))
        || msg.includes('track ended') || msg.includes('audio input lost')) {
        return 'mic_disconnected'
    }

    // No microphone found
    if (msg.includes('notfounderror') || msg.includes('not found') || msg.includes('no device')
        || msg.includes('requested device') || msg.includes('no audio input')) {
        return 'mic_not_found'
    }

    // Network issues
    if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('timeout')
        || msg.includes('aborted') || msg.includes('connection') || msg.includes('offline')
        || msg.includes('websocket') || msg.includes('ice') || msg.includes('signaling')) {
        return 'network'
    }

    return 'generic'
}

const ERROR_MESSAGES: Record<ErrorType, { title: string; message: string; action: string }> = {
    mic_denied: {
        title: 'Microphone Access Denied',
        message: 'Please allow microphone access in your browser settings to continue the interview.',
        action: 'Open Settings & Try Again',
    },
    mic_not_found: {
        title: 'No Microphone Found',
        message: 'We could not detect a microphone on your device. Please connect a microphone and try again.',
        action: 'Try Again',
    },
    mic_disconnected: {
        title: 'Microphone Disconnected',
        message: 'Your microphone was disconnected during the interview. We saved your partial responses.',
        action: 'Close',
    },
    network: {
        title: 'Connection Lost',
        message: 'Your internet connection appears to be unstable. Please check your connection and try again.',
        action: 'Reconnect',
    },
    generic: {
        title: 'Something went wrong',
        message: 'There was an issue with the call. Please try again.',
        action: 'Try Again',
    },
}

export default function VoiceInterviewPage() {
    const params = useParams()
    const router = useRouter()
    const token = params?.token as string

    const [candidate, setCandidate] = useState<VoiceCandidatePublic | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [callState, setCallState] = useState<'idle' | 'connecting' | 'active' | 'ended' | 'processing' | 'error'>('idle')
    const [errorType, setErrorType] = useState<ErrorType>('generic')
    const [isOnline, setIsOnline] = useState(true)
    const [showDisconnectionModal, setShowDisconnectionModal] = useState(false)
    const vapiRef = useRef<Vapi | null>(null)
    const capturedCallIdRef = useRef<string | null>(null)
    const disconnectTimeRef = useRef<string | null>(null)

    // Redirect to setup page if microphone setup hasn't been completed
    // Microphone is MANDATORY for voice interviews - no skip option
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const micSetupCompleted = sessionStorage.getItem('micSetupCompleted')

            if (!micSetupCompleted && token) {
                router.push(`/voice-interview/${token}/setup`)
            }
        }
    }, [token, router])

    // Monitor network connectivity
    useEffect(() => {
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => {
            setIsOnline(false)
            // If call is active, show network warning
            if (callState === 'active') {
                setErrorType('network')
                setCallState('error')
            }
        }
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [callState])

    useEffect(() => {
        if (token) fetchCandidate()
    }, [token])

    const fetchCandidate = async () => {
        try {
            setLoading(true)
            const data = await getCandidateByToken(token)
            setCandidate(data)

            if (data.status === 'completed') {
                setCallState('ended')
            }
        } catch (err: any) {
            setError('Interview link is invalid or has expired.')
        } finally {
            setLoading(false)
        }
    }

    const showError = useCallback((err: any) => {
        const type = classifyError(err)
        setErrorType(type)
        setCallState('error')
        vapiRef.current = null
    }, [])

    const handleMicrophoneDisconnection = useCallback(() => {
        console.warn('[Interview] Microphone disconnected during call')

        // Record disconnection time
        disconnectTimeRef.current = new Date().toISOString()

        // Show disconnection modal
        setShowDisconnectionModal(true)

        // Log disconnect event to backend
        if (capturedCallIdRef.current && token) {
            fetch(`/api/v1/voice-screening/candidates/token/${token}/reconnect?call_id=${capturedCallIdRef.current}&timestamp=${disconnectTimeRef.current}&event_type=disconnect`, {
                method: 'POST'
            }).catch((err: any) => console.error('Failed to log disconnect event:', err))
        }
    }, [token])

    const handleReconnect = useCallback(async () => {
        console.log('[Interview] Attempting to reconnect microphone...')

        // Log reconnection attempt
        const attemptTime = new Date().toISOString()
        if (capturedCallIdRef.current && token) {
            try {
                await fetch(`/api/v1/voice-screening/candidates/token/${token}/reconnect?call_id=${capturedCallIdRef.current}&timestamp=${attemptTime}&event_type=reconnect_attempt`, {
                    method: 'POST'
                })
            } catch (err: any) {
                console.error('Failed to log reconnect attempt:', err)
            }
        }

        // VAPI doesn't support mid-call stream replacement
        // So reconnection is not possible - must end call
        throw new Error('Mid-call reconnection is not supported. Please end the call.')
    }, [token])

    const handleEndCallGracefully = useCallback(async () => {
        console.log('[Interview] Ending call gracefully due to disconnection')

        // Close modal
        setShowDisconnectionModal(false)

        // Stop VAPI call
        if (vapiRef.current) {
            try {
                vapiRef.current.stop()
            } catch (err) {
                console.error('Error stopping VAPI:', err)
            }
            vapiRef.current = null
        }

        // Set error state with mic_disconnected type
        setErrorType('mic_disconnected')
        setCallState('error')

        // Try to save partial transcript
        if (capturedCallIdRef.current) {
            try {
                console.log('[Interview] Attempting to save partial transcript...')
                await fetchCallData(token, capturedCallIdRef.current)
            } catch (err) {
                console.error('Failed to fetch partial call data:', err)
            }
        }
    }, [token])

    const handleStartInterview = async () => {
        if (!VAPI_PUBLIC_KEY || !candidate) return

        // Check network before starting
        if (!navigator.onLine) {
            setErrorType('network')
            setCallState('error')
            return
        }

        try {
            setCallState('connecting')

            const vapi = new Vapi(VAPI_PUBLIC_KEY)
            vapiRef.current = vapi

            // Setup event handlers
            let callIdSent = false;
            vapi.on('message', (message: any) => {
                if (message.type === 'call-update' && message.call?.id && !callIdSent) {
                    callIdSent = true;
                    capturedCallIdRef.current = message.call.id;
                    startCall(candidate.interview_token, message.call.id).catch(() => { })
                }
            })

            vapi.on('call-start', () => {
                setCallState('active')
                startCall(candidate.interview_token, '').catch(() => { })
            })

            vapi.on('call-end', () => {
                vapiRef.current = null
                const callId = capturedCallIdRef.current
                if (callId && token) {
                    setCallState('processing')
                    setTimeout(async () => {
                        try {
                            await fetchCallData(token, callId)
                        } catch (err) {
                            console.error('Auto-fetch call data failed:', err)
                        }
                        setCallState('ended')
                    }, 10000)
                } else {
                    setCallState('ended')
                }
            })

            vapi.on('error', (error: any) => {
                // "Meeting ended due to ejection" is normal when agent ends the call
                const errMsg = error?.message || error?.error?.message || JSON.stringify(error)
                if (errMsg?.includes('ejection') || errMsg?.includes('Meeting has ended')) {
                    console.log('Call ended by agent (normal)')
                    return
                }
                console.error('Vapi error:', error)

                // Check if it's a microphone disconnection
                const errType = classifyError(error)
                if (errType === 'mic_disconnected' && callState === 'active') {
                    handleMicrophoneDisconnection()
                } else {
                    showError(error)
                }
            })

            // NEW WORKFLOW: Use dynamic campaign config if available
            let startResult: any
            if (candidate.vapi_config) {
                console.log('Using dynamic campaign configuration')
                const {
                    knowledgeBase,
                    functions,
                    endOfSpeechTimeout,
                    interruptionThreshold,
                    endCallPhrases,
                    backgroundDenoisingEnabled,
                    ...cleanConfig
                } = candidate.vapi_config as any

                if (cleanConfig.server?.url?.includes('localhost') || cleanConfig.server?.url?.includes('127.0.0.1')) {
                    console.warn('Removing server block with localhost URL')
                    delete cleanConfig.server
                }

                if (cleanConfig.model?.tools) {
                    cleanConfig.model.tools = cleanConfig.model.tools.filter(
                        (tool: any) => {
                            const fnName = tool.function?.name || tool.name || ''
                            return !['end_call', 'flag_concern'].includes(fnName)
                        }
                    )
                    if (cleanConfig.model.tools.length === 0) {
                        delete cleanConfig.model.tools
                    }
                }

                if (!cleanConfig.endCallFunctionEnabled) {
                    cleanConfig.endCallFunctionEnabled = true
                }

                if (cleanConfig.model?.systemPrompt) {
                    const hasSystemMsg = cleanConfig.model.messages?.some(
                        (m: any) => m.role === 'system'
                    )
                    if (!hasSystemMsg) {
                        cleanConfig.model.messages = [
                            { role: 'system', content: cleanConfig.model.systemPrompt },
                            ...(cleanConfig.model.messages || []),
                        ]
                    }
                    delete cleanConfig.model.systemPrompt
                }
                if (cleanConfig.voice) {
                    delete cleanConfig.voice.style
                    delete cleanConfig.voice.useSpeakerBoost
                }

                console.log('Cleaned VAPI config:', JSON.stringify(cleanConfig, null, 2))
                startResult = await vapi.start(cleanConfig)
            }
            else if (VAPI_ASSISTANT_ID) {
                console.log('Using static assistant ID (backward compatible)')
                startResult = await vapi.start(VAPI_ASSISTANT_ID, {
                    variableValues: {
                        candidate_name: candidate.name,
                    },
                })
            }
            else {
                console.log('Using inline configuration (fallback)')
                startResult = await vapi.start({
                    model: {
                        provider: 'openai',
                        model: 'gpt-4o-mini',
                        messages: [
                            {
                                role: 'system',
                                content: `You are an HR screening assistant conducting a voice interview with ${candidate.name}.
Ask relevant screening questions about their experience, skills, and availability.
Be conversational and professional.`,
                            },
                        ],
                    },
                    voice: {
                        provider: '11labs',
                        voiceId: 'nPczCjzI2devNBz1zQrb',
                    },
                    transcriber: {
                        provider: 'deepgram',
                        model: 'nova-2',
                        language: 'en',
                    },
                })
            }

            if (startResult?.id && !capturedCallIdRef.current) {
                capturedCallIdRef.current = startResult.id
                startCall(candidate.interview_token, startResult.id).catch(() => { })
            }
        } catch (err: any) {
            console.error('Start call error:', err)
            showError(err)
        }
    }

    const handleEndCall = () => {
        vapiRef.current?.stop()
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-teal-900 to-slate-900 flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-teal-400" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-teal-900 to-slate-900 flex items-center justify-center p-4">
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md text-center border border-white/20">
                    <AlertCircle className="h-16 w-16 mx-auto text-red-400 mb-4" />
                    <h1 className="text-2xl font-bold text-white mb-2">Link Invalid</h1>
                    <p className="text-gray-300">{error}</p>
                </div>
            </div>
        )
    }

    const currentError = ERROR_MESSAGES[errorType]

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-teal-900 to-slate-900 flex items-center justify-center p-4">
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full text-center border border-white/20 shadow-2xl">
                {/* Logo / Header */}
                <div className="mb-8">
                    <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-r from-teal-400 to-green-400 flex items-center justify-center mb-4 shadow-lg">
                        <Phone className="h-8 w-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Voice Screening Interview</h1>
                    <p className="text-teal-200 mt-2">Welcome, {candidate?.name}</p>
                </div>

                {/* Network warning banner */}
                {!isOnline && callState !== 'error' && (
                    <div className="mb-4 p-3 rounded-lg bg-yellow-500/20 border border-yellow-500/40 flex items-center gap-2 text-yellow-200 text-sm">
                        <WifiOff className="h-4 w-4 flex-shrink-0" />
                        <span>You appear to be offline. Please check your connection.</span>
                    </div>
                )}

                {/* Call States */}
                {callState === 'idle' && (
                    <div className="space-y-6">
                        <div className="bg-white/5 rounded-xl p-4 text-left text-sm text-gray-300 space-y-2">
                            <p>This is an AI-powered voice interview that will ask you a few questions about your background.</p>
                            <p>Please ensure your microphone is enabled and you&apos;re in a quiet place.</p>
                            <p>The call will take approximately 5-10 minutes.</p>
                        </div>

                        {/* Screen monitoring notice */}
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-left text-sm">
                            <p className="text-yellow-200 font-medium flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                <span>Your screen is continuously captured and monitored during the interview to ensure authenticity.</span>
                            </p>
                        </div>

                        <button
                            onClick={handleStartInterview}
                            disabled={!isOnline}
                            className="w-full py-4 rounded-xl bg-gradient-to-r from-teal-500 to-green-500 hover:from-teal-600 hover:to-green-600 text-white font-semibold text-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            <Mic className="h-6 w-6" />
                            {isOnline ? 'Start Interview' : 'Waiting for connection...'}
                        </button>
                    </div>
                )}

                {callState === 'connecting' && (
                    <div className="space-y-4 py-8">
                        <Loader2 className="h-12 w-12 animate-spin text-teal-400 mx-auto" />
                        <p className="text-teal-200 text-lg">Connecting...</p>
                        <p className="text-gray-400 text-sm">Please allow microphone access when prompted</p>
                    </div>
                )}

                {callState === 'active' && (
                    <div className="space-y-6 py-4">
                        <div className="relative">
                            <div className="h-24 w-24 mx-auto rounded-full bg-gradient-to-r from-teal-400 to-green-400 flex items-center justify-center animate-pulse shadow-lg shadow-teal-500/30">
                                <Mic className="h-12 w-12 text-white" />
                            </div>
                            <div className="absolute inset-0 h-24 w-24 mx-auto rounded-full border-2 border-teal-400/30 animate-ping" />
                        </div>
                        <div>
                            <p className="text-white text-lg font-medium">Interview in progress...</p>
                            <p className="text-teal-200 text-sm mt-1">Speak clearly into your microphone</p>
                        </div>
                        <button
                            onClick={handleEndCall}
                            className="w-full py-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 transition-all flex items-center justify-center gap-2"
                        >
                            <MicOff className="h-5 w-5" />
                            End Interview
                        </button>
                    </div>
                )}

                {callState === 'processing' && (
                    <div className="space-y-4 py-8">
                        <Loader2 className="h-12 w-12 animate-spin text-teal-400 mx-auto" />
                        <h2 className="text-xl font-bold text-white">Processing your interview...</h2>
                        <p className="text-gray-300">
                            Please wait while we save your responses. This may take a few seconds.
                        </p>
                    </div>
                )}

                {callState === 'ended' && (
                    <div className="space-y-4 py-8">
                        <CheckCircle className="h-16 w-16 text-green-400 mx-auto" />
                        <h2 className="text-xl font-bold text-white">Thank You!</h2>
                        <p className="text-gray-300">
                            Your voice interview has been completed and recorded. Our team will review your responses.
                        </p>
                    </div>
                )}

                {callState === 'error' && (
                    <div className="space-y-4 py-8">
                        {errorType === 'mic_denied' || errorType === 'mic_not_found' ? (
                            <MicOffIcon className="h-16 w-16 text-red-400 mx-auto" />
                        ) : errorType === 'network' ? (
                            <WifiOff className="h-16 w-16 text-yellow-400 mx-auto" />
                        ) : (
                            <AlertCircle className="h-16 w-16 text-red-400 mx-auto" />
                        )}
                        <h2 className="text-xl font-bold text-white">{currentError.title}</h2>
                        <p className="text-gray-300">{currentError.message}</p>

                        {errorType === 'mic_denied' && (
                            <div className="bg-white/5 rounded-lg p-3 text-left text-xs text-gray-400 space-y-1">
                                <p className="font-medium text-gray-300">How to enable microphone:</p>
                                <p>1. Tap the lock/settings icon in your browser&apos;s address bar</p>
                                <p>2. Find &quot;Microphone&quot; and set it to &quot;Allow&quot;</p>
                                <p>3. Refresh this page and try again</p>
                            </div>
                        )}

                        {errorType === 'network' && (
                            <div className="bg-white/5 rounded-lg p-3 text-left text-xs text-gray-400 space-y-1">
                                <p className="font-medium text-gray-300">Troubleshooting tips:</p>
                                <p>1. Check if Wi-Fi or mobile data is turned on</p>
                                <p>2. Move to an area with better signal</p>
                                <p>3. Try switching between Wi-Fi and mobile data</p>
                            </div>
                        )}

                        <button
                            onClick={() => {
                                setErrorType('generic')
                                setCallState('idle')
                            }}
                            className="py-3 px-6 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all"
                        >
                            {currentError.action}
                        </button>
                    </div>
                )}
            </div>

            {/* Disconnection Modal */}
            <DisconnectionModal
                isOpen={showDisconnectionModal}
                onReconnect={handleReconnect}
                onEndCall={handleEndCallGracefully}
                reconnectTimeoutSeconds={30}
            />
        </div>
    )
}
