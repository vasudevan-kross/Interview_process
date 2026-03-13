'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
    Mic,
    MicOff,
    X,
    CheckCircle2,
    Copy,
    Share2,
    ExternalLink,
    MessageSquare,
    Send,
    Bot,
    RotateCcw,
    ArrowUpRight,
} from 'lucide-react'
import {
    getVoiceSessionStart,
    voiceSession,
    type VoiceSessionResponse,
    generateShareableLink,
} from '@/lib/api/coding-interviews'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
    role: 'ai' | 'user'
    content: string
    timestamp: Date
}

interface VoiceCreateModalProps {
    open: boolean
    onClose: () => void
    onCreated?: () => void
}

// ---------------------------------------------------------------------------
// Field configuration — mirrors backend FIELD_ORDER
// ---------------------------------------------------------------------------

const FIELDS: Array<{
    key: string           // backend current_field value
    label: string
    collectedBy: (c: Record<string, any>) => boolean
}> = [
    { key: 'title',                label: 'Title',           collectedBy: (c) => !!c.title },
    { key: 'interview_type',       label: 'Interview Type',  collectedBy: (c) => !!c.interview_type },
    { key: 'language',             label: 'Language',        collectedBy: (c) => !!(c.programming_language || c.test_framework || c.domain_tool) },
    { key: 'scheduled_start_time', label: 'Start Time',      collectedBy: (c) => !!c.scheduled_start_time },
    { key: 'scheduled_end_time',   label: 'End Time',        collectedBy: (c) => !!c.scheduled_end_time },
    { key: 'grace_period_minutes', label: 'Grace Period',    collectedBy: (c) => c.grace_period_minutes != null },
    { key: 'resume_required',      label: 'Resume Policy',   collectedBy: (c) => !!c.resume_required },
    { key: 'require_signature',    label: 'Bond / Sign',     collectedBy: (c) => c.require_signature != null },
    { key: 'bond_details',         label: 'Bond Details',    collectedBy: (c) => !!(c.bond_terms || c.bond_years) },
    { key: 'questions_prompt',     label: 'Questions',       collectedBy: (c) => !!(c.job_description || c.num_questions) },
]

function getFieldValue(key: string, c: Record<string, any>): string | undefined {
    switch (key) {
        case 'title':                return c.title
        case 'interview_type':       return c.interview_type
        case 'language':             return c.programming_language || c.test_framework || c.domain_tool
        case 'scheduled_start_time': return c.scheduled_start_time
        case 'scheduled_end_time':   return c.scheduled_end_time
        case 'grace_period_minutes': return c.grace_period_minutes != null ? `${c.grace_period_minutes} min` : undefined
        case 'resume_required':      return c.resume_required
        case 'require_signature':    return c.require_signature != null
            ? c.require_signature ? `Yes – ${c.bond_years ?? '?'} yr` : 'No'
            : undefined
        case 'bond_details':         return c.bond_terms ? c.bond_terms.slice(0, 40) + (c.bond_terms.length > 40 ? '…' : '') : undefined
        case 'questions_prompt':     return c.num_questions ? `${c.num_questions} × ${c.difficulty ?? 'medium'}` : undefined
        default:                     return undefined
    }
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VoiceCreateModal({ open, onClose, onCreated }: VoiceCreateModalProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [sessionState, setSessionState] = useState<Record<string, any>>({})
    const [isProcessing, setIsProcessing] = useState(false)
    const [isInitializing, setIsInitializing] = useState(false)
    const [isSpeaking, setIsSpeaking] = useState(false)
    const [done, setDone] = useState(false)
    const [createdLink, setCreatedLink] = useState('')
    const [isSpeechSupported, setIsSpeechSupported] = useState(true)
    const [inputMode, setInputMode] = useState<'chat' | 'voice'>('chat')
    const [chatText, setChatText] = useState('')

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const hasSubmittedRef = useRef(false)
    const chatInputRef = useRef<HTMLInputElement>(null)
    const inputModeRef = useRef(inputMode)

    const { transcript, listening, resetTranscript, browserSupportsSpeechRecognition, isMicrophoneAvailable } =
        useSpeechRecognition()

    // Derived state from session
    const collected: Record<string, any> = sessionState.collected || {}
    const currentField: string = sessionState.current_field || ''
    const collectedCount = FIELDS.filter((f) => f.collectedBy(collected)).length
    // bond_details might be skipped (if no signature), so max could be 9 or 10
    const totalFields = collected.require_signature === true ? 10 : 9
    const progressPct = done ? 100 : Math.round((collectedCount / totalFields) * 100)

    // -------------------------------------------------------------------------
    // Auto-scroll
    // -------------------------------------------------------------------------
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, transcript])

    // -------------------------------------------------------------------------
    // Speech support check
    // -------------------------------------------------------------------------
    useEffect(() => {
        setIsSpeechSupported(browserSupportsSpeechRecognition)
    }, [browserSupportsSpeechRecognition])

    // -------------------------------------------------------------------------
    // Init / reset when modal opens
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!open) return
        // Reset everything
        hasSubmittedRef.current = false
        setMessages([])
        setSessionState({})
        setDone(false)
        setCreatedLink('')
        setChatText('')
        setInputMode('chat')   // always start in chat mode

        const init = async () => {
            setIsInitializing(true)
            try {
                const res = await getVoiceSessionStart()
                setSessionState(res.session_state)
                pushAiMessage(res.reply)
            } catch {
                toast.error('Failed to start AI session. Is the backend running?')
            } finally {
                setIsInitializing(false)
            }
        }
        init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    // -------------------------------------------------------------------------
    // Cleanup on close
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!open) {
            SpeechRecognition.stopListening()
            window.speechSynthesis?.cancel()
        }
    }, [open])

    // Keep inputModeRef in sync so async callbacks always read the latest mode
    useEffect(() => {
        inputModeRef.current = inputMode
    }, [inputMode])

    // Focus chat input on mode/open/done change
    useEffect(() => {
        if (inputMode === 'chat' && open && !done) {
            setTimeout(() => chatInputRef.current?.focus(), 80)
        }
    }, [inputMode, open, done])

    // Refocus chat input after AI finishes responding
    useEffect(() => {
        if (!isProcessing && inputMode === 'chat' && open && !done) {
            setTimeout(() => chatInputRef.current?.focus(), 80)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isProcessing])

    // Auto-start mic after AI finishes speaking (voice mode)
    // Uses inputModeRef to avoid stale closure when mode switches mid-speech
    useEffect(() => {
        if (!isSpeaking && inputModeRef.current === 'voice' && open && !done && !isProcessing) {
            resetTranscript()
            hasSubmittedRef.current = false
            SpeechRecognition.startListening({ continuous: true, language: 'en-IN' })
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSpeaking])

    // -------------------------------------------------------------------------
    // Message helpers
    // -------------------------------------------------------------------------
    const pushAiMessage = (content: string) =>
        setMessages((prev) => [...prev, { role: 'ai', content, timestamp: new Date() }])

    const pushUserMessage = (content: string) =>
        setMessages((prev) => [...prev, { role: 'user', content, timestamp: new Date() }])

    const speak = useCallback((text: string) => {
        if (!window.speechSynthesis) return
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(text)
        u.rate = 1.0
        u.pitch = 1.0
        u.onstart = () => setIsSpeaking(true)
        u.onend = () => setIsSpeaking(false)
        u.onerror = () => setIsSpeaking(false)
        window.speechSynthesis.speak(u)
    }, [])

    // -------------------------------------------------------------------------
    // Core: send message to backend
    // -------------------------------------------------------------------------
    const submitMessage = useCallback(
        async (text: string, currentInputMode: 'chat' | 'voice') => {
            if (!text.trim() || isProcessing || hasSubmittedRef.current) return
            hasSubmittedRef.current = true

            SpeechRecognition.stopListening()
            resetTranscript()
            pushUserMessage(text)
            setIsProcessing(true)
            window.speechSynthesis?.cancel()

            try {
                const res: VoiceSessionResponse = await voiceSession({
                    message: text,
                    session_state: sessionState,
                })

                setSessionState(res.session_state)
                pushAiMessage(res.reply)

                // Speak only if still in voice mode at time of response
                if (currentInputMode === 'voice') speak(res.reply)

                if (res.done) {
                    setDone(true)
                    if (res.access_token) setCreatedLink(generateShareableLink(res.access_token))
                    onCreated?.()
                }
            } catch (err: any) {
                const msg = err?.message || 'Something went wrong. Please try again.'
                pushAiMessage(msg)
                toast.error(msg)
            } finally {
                setIsProcessing(false)
                hasSubmittedRef.current = false
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isProcessing, sessionState, resetTranscript, onCreated, speak],
    )

    // -------------------------------------------------------------------------
    // Chat send
    // -------------------------------------------------------------------------
    const handleChatSend = () => {
        const text = chatText.trim()
        if (!text) return
        setChatText('')
        submitMessage(text, 'chat')
    }

    // -------------------------------------------------------------------------
    // Switch to chat — salvage any partial transcript
    // -------------------------------------------------------------------------
    const switchToChat = () => {
        SpeechRecognition.stopListening()
        window.speechSynthesis?.cancel()
        setIsSpeaking(false)
        // Pre-fill chat input with whatever was being spoken
        if (transcript.trim()) {
            setChatText(transcript.trim())
            resetTranscript()
        }
        setInputMode('chat')
    }

    // -------------------------------------------------------------------------
    // Mic toggle
    // -------------------------------------------------------------------------
    const toggleMic = () => {
        if (listening) {
            SpeechRecognition.stopListening()
            if (transcript.trim()) submitMessage(transcript, 'voice')
        } else {
            resetTranscript()
            hasSubmittedRef.current = false
            SpeechRecognition.startListening({ continuous: true, language: 'en-IN' })
        }
    }

    // -------------------------------------------------------------------------
    // Start over
    // -------------------------------------------------------------------------
    const handleStartOver = async () => {
        hasSubmittedRef.current = false
        SpeechRecognition.stopListening()
        window.speechSynthesis?.cancel()
        setMessages([])
        setSessionState({})
        setDone(false)
        setCreatedLink('')
        setChatText('')
        setIsSpeaking(false)
        setIsInitializing(true)
        try {
            const res = await getVoiceSessionStart()
            setSessionState(res.session_state)
            pushAiMessage(res.reply)
        } catch {
            toast.error('Failed to restart session')
        } finally {
            setIsInitializing(false)
        }
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(createdLink)
        toast.success('Link copied!')
    }

    const handleWhatsApp = () => {
        window.open(`https://wa.me/?text=${encodeURIComponent(`Interview Link: ${createdLink}`)}`, '_blank')
    }

    if (!open) return null

    const isInputDisabled = isProcessing || isInitializing || done

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[900px] h-[88vh] flex flex-col overflow-hidden border border-slate-200/80">

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-white shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                            <Bot className="h-4 w-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-slate-900 font-semibold text-sm leading-tight">AI Assessment Builder</h2>
                            <p className="text-slate-400 text-xs leading-tight">
                                {done
                                    ? 'Assessment created'
                                    : isInitializing
                                    ? 'Starting session…'
                                    : currentField
                                    ? `Collecting: ${FIELDS.find((f) => f.key === currentField)?.label ?? currentField}`
                                    : 'Chat or speak to create your assessment'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Live status pills */}
                        {isSpeaking && inputMode === 'voice' && (
                            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 text-[11px] font-medium border border-violet-200 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" />
                                Speaking
                            </span>
                        )}
                        {listening && (
                            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[11px] font-medium border border-red-200 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                                Listening
                            </span>
                        )}

                        {/* Mode toggle — hidden when done */}
                        {!done && (
                            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
                                <button
                                    onClick={switchToChat}
                                    className={cn(
                                        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                                        inputMode === 'chat'
                                            ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                                            : 'text-slate-500 hover:text-slate-700',
                                    )}
                                >
                                    <MessageSquare className="h-3 w-3" />
                                    Chat
                                </button>
                                <button
                                    onClick={() => setInputMode('voice')}
                                    className={cn(
                                        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                                        inputMode === 'voice'
                                            ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                                            : 'text-slate-500 hover:text-slate-700',
                                    )}
                                >
                                    <Mic className="h-3 w-3" />
                                    Voice
                                </button>
                            </div>
                        )}

                        {/* Start over — only after conversation started */}
                        {messages.length > 0 && !done && (
                            <button
                                onClick={handleStartOver}
                                disabled={isProcessing || isInitializing}
                                title="Start over"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                        )}

                        <button
                            onClick={onClose}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* ── Progress bar ── */}
                <div className="h-0.5 bg-slate-100 shrink-0">
                    <div
                        className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>

                {/* ── Body ── */}
                <div className="flex flex-1 overflow-hidden min-h-0">

                    {/* ── Chat panel ── */}
                    <div className="flex flex-col flex-1 min-w-0">

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                            {isInitializing ? (
                                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
                                    <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
                                        <Bot className="h-5 w-5 text-indigo-400 animate-pulse" />
                                    </div>
                                    <p className="text-sm">Starting session…</p>
                                </div>
                            ) : (
                                <>
                                    {messages.map((msg, i) => (
                                        <div
                                            key={i}
                                            className={cn(
                                                'flex gap-2.5 group',
                                                msg.role === 'user' ? 'justify-end' : 'justify-start',
                                            )}
                                        >
                                            {/* AI avatar */}
                                            {msg.role === 'ai' && (
                                                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-1">
                                                    <Bot className="h-3.5 w-3.5 text-indigo-600" />
                                                </div>
                                            )}

                                            <div className="flex flex-col gap-0.5 max-w-[80%]">
                                                <div
                                                    className={cn(
                                                        'px-4 py-2.5 text-sm leading-relaxed',
                                                        msg.role === 'ai'
                                                            ? 'bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-sm shadow-sm'
                                                            : 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm',
                                                    )}
                                                >
                                                    {msg.content}
                                                </div>
                                                <span className={cn(
                                                    'text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity',
                                                    msg.role === 'user' ? 'text-right' : 'text-left',
                                                )}>
                                                    {formatTime(msg.timestamp)}
                                                </span>
                                            </div>

                                            {/* User avatar placeholder (keeps layout consistent) */}
                                            {msg.role === 'user' && <div className="w-7 shrink-0" />}
                                        </div>
                                    ))}

                                    {/* Live transcript (voice mode) */}
                                    {listening && transcript && (
                                        <div className="flex justify-end gap-2.5">
                                            <div className="max-w-[80%] px-4 py-2.5 text-sm bg-indigo-50 text-indigo-600 rounded-2xl rounded-tr-sm border border-indigo-200 italic">
                                                {transcript}
                                                <span className="inline-block w-1 h-3.5 bg-indigo-400 ml-1 animate-pulse rounded-sm" />
                                            </div>
                                            <div className="w-7 shrink-0" />
                                        </div>
                                    )}

                                    {/* Typing indicator */}
                                    {isProcessing && (
                                        <div className="flex gap-2.5">
                                            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-1">
                                                <Bot className="h-3.5 w-3.5 text-indigo-600" />
                                            </div>
                                            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                                                <div className="flex gap-1 items-center h-4">
                                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:160ms]" />
                                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:320ms]" />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div ref={messagesEndRef} />
                                </>
                            )}
                        </div>

                        {/* ── Input area ── */}
                        <div className="px-5 pb-5 pt-3 border-t border-slate-100 bg-white shrink-0">
                            {done ? (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 py-2 px-3 bg-green-50 border border-green-200 rounded-xl">
                                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                        <span className="text-sm font-medium text-green-800">Assessment created successfully!</span>
                                    </div>
                                    {createdLink && (
                                        <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                                            <span className="flex-1 font-mono text-xs text-slate-600 truncate">{createdLink}</span>
                                            <button
                                                onClick={handleCopy}
                                                className="shrink-0 p-1 rounded-md hover:bg-slate-200 transition-colors"
                                                title="Copy"
                                            >
                                                <Copy className="h-3.5 w-3.5 text-slate-500" />
                                            </button>
                                        </div>
                                    )}
                                    <div className="flex gap-2">
                                        <Button size="sm" onClick={handleCopy} className="flex-1">
                                            <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy Link
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={handleWhatsApp} className="flex-1">
                                            <Share2 className="h-3.5 w-3.5 mr-1.5" /> WhatsApp
                                        </Button>
                                        {createdLink && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => window.open(createdLink, '_blank')}
                                                className="shrink-0"
                                                title="Open assessment"
                                            >
                                                <ArrowUpRight className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                        <Button size="sm" variant="ghost" onClick={onClose} className="shrink-0">
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ) : inputMode === 'chat' ? (
                                <div className="flex items-center gap-2 p-1.5 rounded-xl border border-slate-200 bg-slate-50 focus-within:border-indigo-400 focus-within:bg-white transition-colors">
                                    <input
                                        ref={chatInputRef}
                                        type="text"
                                        value={chatText}
                                        onChange={(e) => setChatText(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault()
                                                handleChatSend()
                                            }
                                        }}
                                        placeholder={isInitializing ? 'Starting…' : 'Type your response and press Enter…'}
                                        disabled={isInputDisabled}
                                        className="flex-1 bg-transparent px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
                                    />
                                    <button
                                        onClick={handleChatSend}
                                        disabled={!chatText.trim() || isInputDisabled}
                                        className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                                    >
                                        <Send className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ) : !isSpeechSupported ? (
                                <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                                    Speech not supported in this browser.{' '}
                                    <button onClick={switchToChat} className="underline font-medium">Switch to chat</button>
                                </div>
                            ) : !isMicrophoneAvailable ? (
                                <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                                    Microphone access required. Allow it in your browser settings.
                                </div>
                            ) : (
                                <div className="flex items-center justify-between gap-4">
                                    <p className="text-xs text-slate-400 flex-1">
                                        {isProcessing
                                            ? 'Processing your response…'
                                            : isSpeaking
                                            ? 'AI is speaking — tap mic when ready'
                                            : listening
                                            ? 'Listening… tap the button to send'
                                            : 'Tap the mic to start speaking'}
                                    </p>
                                    <button
                                        onClick={toggleMic}
                                        disabled={isProcessing || isInitializing}
                                        className={cn(
                                            'relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 shrink-0',
                                            listening
                                                ? 'bg-red-500 hover:bg-red-600 ring-4 ring-red-200 scale-110'
                                                : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105 shadow-md',
                                            (isProcessing || isInitializing) && 'opacity-40 cursor-not-allowed scale-100',
                                        )}
                                    >
                                        {listening ? (
                                            <MicOff className="h-5 w-5 text-white" />
                                        ) : (
                                            <Mic className="h-5 w-5 text-white" />
                                        )}
                                        {listening && (
                                            <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Progress / preview sidebar ── */}
                    <div className="w-60 border-l border-slate-100 flex flex-col shrink-0 bg-slate-50/40">
                        <div className="px-4 pt-4 pb-2">
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Progress</p>
                                <span className="text-[10px] font-semibold text-slate-500 tabular-nums">
                                    {collectedCount}/{totalFields}
                                </span>
                            </div>
                            <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                    style={{ width: `${progressPct}%` }}
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5">
                            {FIELDS.map((field) => {
                                const isCollected = field.collectedBy(collected)
                                const isCurrent = !done && field.key === currentField && !isCollected
                                const value = getFieldValue(field.key, collected)
                                // Hide bond_details if signature not required
                                if (field.key === 'bond_details' && collected.require_signature === false) return null

                                return (
                                    <div
                                        key={field.key}
                                        className={cn(
                                            'flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-colors',
                                            isCurrent && 'bg-indigo-50 border border-indigo-200',
                                            isCollected && !isCurrent && 'opacity-80',
                                        )}
                                    >
                                        {/* Status dot */}
                                        <div className="mt-0.5 shrink-0">
                                            {isCollected ? (
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                            ) : isCurrent ? (
                                                <span className="flex h-3.5 w-3.5 items-center justify-center">
                                                    <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                                                </span>
                                            ) : (
                                                <span className="h-3.5 w-3.5 flex items-center justify-center">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                                </span>
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <p className={cn(
                                                'text-xs font-medium leading-tight',
                                                isCollected ? 'text-slate-700' : isCurrent ? 'text-indigo-700' : 'text-slate-400',
                                            )}>
                                                {field.label}
                                            </p>
                                            {value && (
                                                <p className="text-[11px] text-slate-500 truncate mt-0.5">{value}</p>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {done && createdLink && (
                            <div className="px-3 pb-4">
                                <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50">
                                    <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold mb-2">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Created
                                    </div>
                                    <a
                                        href={createdLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 hover:underline break-all"
                                    >
                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                        Open assessment
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
