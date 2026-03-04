'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { getCandidateByToken, startCall, type VoiceCandidatePublic } from '@/lib/api/voice-screening'
import { Phone, Mic, MicOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import Vapi from '@vapi-ai/web'

const VAPI_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || ''
const VAPI_ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID || ''

export default function VoiceInterviewPage() {
    const params = useParams()
    const token = params?.token as string

    const [candidate, setCandidate] = useState<VoiceCandidatePublic | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [callState, setCallState] = useState<'idle' | 'connecting' | 'active' | 'ended' | 'error'>('idle')
    const vapiRef = useRef<Vapi | null>(null)

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

    const handleStartInterview = async () => {
        if (!VAPI_PUBLIC_KEY || !candidate) return

        try {
            setCallState('connecting')

            const vapi = new Vapi(VAPI_PUBLIC_KEY)
            vapiRef.current = vapi

            // Setup event handlers
            let callIdSent = false;
            vapi.on('message', (message: any) => {
                if (message.type === 'call-update' && message.call?.id && !callIdSent) {
                    callIdSent = true;
                    // Send actual Call ID to backend so webhook can match it!
                    startCall(candidate.interview_token, message.call.id).catch(() => { })
                }
            })

            vapi.on('call-start', () => {
                setCallState('active')
                startCall(candidate.interview_token, '').catch(() => { })
            })

            vapi.on('call-end', () => {
                setCallState('ended')
                vapiRef.current = null
            })

            vapi.on('error', (error: any) => {
                console.error('Vapi error:', error)
                setCallState('error')
                vapiRef.current = null
            })

            // NEW WORKFLOW: Use dynamic campaign config if available
            if (candidate.vapi_config) {
                console.log('Using dynamic campaign configuration')
                // Strip deprecated 'knowledgeBase' property (removed from Vapi API)
                const { knowledgeBase, ...cleanConfig } = candidate.vapi_config as any
                await vapi.start(cleanConfig)
            }
            // OLD WORKFLOW: Fall back to static assistant ID (BACKWARD COMPATIBLE)
            else if (VAPI_ASSISTANT_ID) {
                console.log('Using static assistant ID (backward compatible)')
                await vapi.start(VAPI_ASSISTANT_ID, {
                    variableValues: {
                        candidate_name: candidate.name,
                    },
                })
            }
            // FALLBACK: No campaign and no assistant ID
            else {
                console.log('Using inline configuration (fallback)')
                await vapi.start({
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
        } catch (err: any) {
            console.error('Start call error:', err)
            setCallState('error')
        }
    }

    const handleEndCall = () => {
        vapiRef.current?.stop()
        setCallState('ended')
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

                {/* Call States */}
                {callState === 'idle' && (
                    <div className="space-y-6">
                        <div className="bg-white/5 rounded-xl p-4 text-left text-sm text-gray-300 space-y-2">
                            <p>📋 This is an AI-powered voice interview that will ask you a few questions about your background.</p>
                            <p>🎙️ Please ensure your microphone is enabled and you&apos;re in a quiet place.</p>
                            <p>⏱️ The call will take approximately 5-10 minutes.</p>
                        </div>
                        <button
                            onClick={handleStartInterview}
                            className="w-full py-4 rounded-xl bg-gradient-to-r from-teal-500 to-green-500 hover:from-teal-600 hover:to-green-600 text-white font-semibold text-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
                        >
                            <Mic className="h-6 w-6" />
                            Start Interview
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
                        <AlertCircle className="h-16 w-16 text-red-400 mx-auto" />
                        <h2 className="text-xl font-bold text-white">Something went wrong</h2>
                        <p className="text-gray-300">There was an issue starting the call. Please check your microphone and try again.</p>
                        <button
                            onClick={() => setCallState('idle')}
                            className="py-3 px-6 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all"
                        >
                            Try Again
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
