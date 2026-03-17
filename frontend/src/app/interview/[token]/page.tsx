'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Code,
  Clock,
  ChevronLeft,
  ChevronRight,
  Send,
  Loader2,
  AlertCircle,
  Save,
  CheckCircle,
  Upload,
  FileText,
  PenTool,
} from 'lucide-react'
import type SignatureCanvasT from 'react-signature-canvas'
import type { SignatureCanvasProps } from 'react-signature-canvas'
import dynamic from 'next/dynamic'

// dynamic() doesn't forward refs by default — cast so TypeScript accepts ref
const SignatureCanvas = dynamic(
  () => import('react-signature-canvas'),
  { ssr: false }
) as React.ForwardRefExoticComponent<SignatureCanvasProps & React.RefAttributes<SignatureCanvasT>>

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  joinInterview,
  startSubmission,
  saveCode,
  submitInterview,
  uploadResume,
  type Interview,
} from '@/lib/api/coding-interviews'
import { initializeEnhancedAntiCheating, createCodeChangeTracker } from '@/lib/anti-cheating-enhanced'
import CodeEditor from '@/components/coding/CodeEditor'
import { toast } from 'sonner'
import { format } from 'date-fns'

export default function CandidateInterviewPage() {
  const params = useParams()
  const router = useRouter()
  const accessToken = params.token as string

  // Interview state
  const [interview, setInterview] = useState<Interview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Submission state
  const [submissionId, setSubmissionId] = useState('')
  const [hasStarted, setHasStarted] = useState(false)
  const [candidateName, setCandidateName] = useState('')
  const [candidateEmail, setCandidateEmail] = useState('')
  const [candidatePhone, setCandidatePhone] = useState('')
  const [resumeFile, setResumeFile] = useState<File | null>(null)

  // Interview progress
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [codeAnswers, setCodeAnswers] = useState<Record<string, string>>({})
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [autoSaving, setAutoSaving] = useState(false)

  // Timer
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [timerExpired, setTimerExpired] = useState(false)
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false)
  const [emptySubmitDialogOpen, setEmptySubmitDialogOpen] = useState(false)

  // Bond agreement (for before_start timing)
  const [bondTermsAccepted, setBondTermsAccepted] = useState(false)
  const [bondHasSignature, setBondHasSignature] = useState(false)
  const [bondSignatureData, setBondSignatureData] = useState<string>('')
  const bondSignatureRef = useRef<any>(null)
  const bondSigContainerRef = useRef<HTMLDivElement>(null)
  const [bondSigWidth, setBondSigWidth] = useState(600)

  // Anti-cheating (enhanced)
  const antiCheatingRef = useRef<Awaited<ReturnType<typeof initializeEnhancedAntiCheating>> | null>(null)
  const codeChangeTrackerRef = useRef<ReturnType<typeof createCodeChangeTracker> | null>(null)

  // Performance refs — avoid stale closures in intervals and debounce hot paths
  const codeAnswersRef = useRef<Record<string, string>>({})
  const hasStartedRef = useRef(false)
  const submissionIdRef = useRef('')
  const lsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // LocalStorage keys for session persistence
  const SESSION_KEY = `ci_session_${accessToken}`
  const ANSWERS_KEY = `ci_answers_${accessToken}`

  const clearSession = () => {
    try {
      localStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(ANSWERS_KEY)
    } catch { }
  }

  // Load interview details — and restore any saved session on refresh
  useEffect(() => {
    loadInterview()
  }, [accessToken])

  const loadInterview = async () => {
    try {
      setLoading(true)
      const data = await joinInterview(accessToken)
      setInterview(data)

      // Calculate time remaining
      const expires = new Date(data.link_expires_at)
      const now = new Date()
      const diff = Math.floor((expires.getTime() - now.getTime()) / 1000)
      setTimeRemaining(Math.max(0, diff))

      // Start with empty answers - no starter code allowed
      const initialAnswers: Record<string, string> = {}
      data.questions?.forEach((q, idx) => {
        initialAnswers[q.id || idx.toString()] = ''
      })

      // Restore session from localStorage if the interview hasn't expired
      // IMPORTANT: parse ALL data before calling any setState so that a parse
      // error never leaves the page in a half-restored state (hasStarted=true
      // with no code / stale submissionId), which caused Q1 to load forever.
      try {
        const savedSession = localStorage.getItem(SESSION_KEY)
        const savedAnswers = localStorage.getItem(ANSWERS_KEY)
        if (savedSession && diff > 0) {
          const session = JSON.parse(savedSession)   // parse first — may throw

          // Reject sessions saved for a different access token
          if (session.submissionId && session.token === accessToken) {
            // Parse answers before touching any state — if this throws the
            // catch block runs and we fall through to the normal pre-start flow
            const restored: Record<string, string> =
              savedAnswers ? JSON.parse(savedAnswers) : {}
            const mergedAnswers = { ...initialAnswers, ...restored }

            // All parsing succeeded — now commit state atomically
            codeAnswersRef.current = mergedAnswers
            setCodeAnswers(mergedAnswers)
            setSubmissionId(session.submissionId)
            setCandidateName(session.candidateName || '')
            setCandidateEmail(session.candidateEmail || '')
            setHasStarted(true)

            toast.info('Session restored — your progress has been recovered.')
            return
          }
        }
      } catch {
        // localStorage not available or data is corrupt — clear it and
        // continue with the normal pre-start flow
        clearSession()
      }

      codeAnswersRef.current = initialAnswers
      setCodeAnswers(initialAnswers)
    } catch (error: any) {
      setError(error.message || 'Failed to load interview')
      toast.error(error.message || 'Failed to load interview')
    } finally {
      setLoading(false)
    }
  }

  // Start submission
  const handleStartSubmission = async () => {
    if (!candidateName.trim() || !candidateEmail.trim()) {
      toast.error('Please enter your name and email')
      return
    }

    // Validate resume if mandatory
    if (interview?.resume_required === 'mandatory' && !resumeFile) {
      toast.error('Please upload your resume before starting')
      return
    }

    // Validate bond signature if required before start
    if (interview?.require_signature && interview?.bond_timing === 'before_start') {
      if (!bondTermsAccepted) {
        toast.error('Please accept the bond terms before starting')
        return
      }
      if (!bondHasSignature) {
        toast.error('Please provide your signature before starting')
        return
      }
      // Capture signature data now — submitted with the final submission
      if (bondSignatureRef.current && !bondSignatureRef.current.isEmpty()) {
        setBondSignatureData(bondSignatureRef.current.toDataURL())
      }
    }

    try {
      setLoading(true)
      const response = await startSubmission(interview!.id, {
        candidate_name: candidateName,
        candidate_email: candidateEmail,
        candidate_phone: candidatePhone,
      })

      // Upload resume if provided
      if (resumeFile) {
        try {
          await uploadResume({
            submission_id: response.submission_id,
            file: resumeFile,
          })
        } catch (resumeErr: any) {
          console.error('Resume upload failed:', resumeErr)
          toast.error('Resume upload failed, but interview has started')
        }
      }

      setSubmissionId(response.submission_id)
      setHasStarted(true)

      // Persist session so refresh restores the interview
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          submissionId: response.submission_id,
          candidateName,
          candidateEmail,
          token: accessToken,   // validated on restore to reject stale/foreign sessions
        }))
      } catch { }

      // Initialize enhanced anti-cheating
      const currentQuestionId = interview?.questions?.[0]?.id || '0'
      antiCheatingRef.current = await initializeEnhancedAntiCheating(response.submission_id, currentQuestionId)
      codeChangeTrackerRef.current = createCodeChangeTracker(response.submission_id, currentQuestionId)

      // Request fullscreen mode for better focus (optional - can be declined by user)
      try {
        await antiCheatingRef.current.requestFullscreen()
        toast.success('Interview started! Stay in fullscreen for best experience.')
      } catch (error) {
        toast.success('Interview started! Good luck!')
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to start interview')
    } finally {
      setLoading(false)
    }
  }

  // Auto-save code
  const autoSaveCode = useCallback(
    async (questionId: string, code: string) => {
      if (!submissionId || !interview) return

      try {
        setAutoSaving(true)
        await saveCode({
          submission_id: submissionId,
          question_id: questionId,
          code,
          programming_language: interview.programming_language,
        })
        setLastSaved(new Date())
      } catch (error) {
        console.error('Auto-save failed:', error)
      } finally {
        setAutoSaving(false)
      }
    },
    [submissionId, interview]
  )

  // Auto-save effect (every 30 seconds)
  // Reads from codeAnswersRef so codeAnswers state changes don't recreate the interval
  useEffect(() => {
    if (!hasStarted || !interview) return

    const interval = setInterval(() => {
      const currentQuestionId = interview.questions?.[currentQuestionIndex]?.id || currentQuestionIndex.toString()
      const currentCode = codeAnswersRef.current[currentQuestionId] || ''
      autoSaveCode(currentQuestionId, currentCode)
    }, 30000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStarted, currentQuestionIndex, autoSaveCode, interview])

  // Timer countdown - single interval created when interview loads
  // Uses refs for hasStarted/submissionId so no need to recreate interval every second
  useEffect(() => {
    if (!interview) return

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 0) return 0          // already expired — no-op
        if (prev === 1) {
          setTimerExpired(true)
          if (hasStartedRef.current) {
            handleAutoSubmit()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview])

  // Update anti-cheating tracker when question changes
  useEffect(() => {
    if (!hasStarted || !interview) return

    const currentQuestionId = interview.questions?.[currentQuestionIndex]?.id || currentQuestionIndex.toString()
    antiCheatingRef.current?.updateQuestionId(currentQuestionId)
    codeChangeTrackerRef.current = createCodeChangeTracker(submissionId, currentQuestionId)
  }, [currentQuestionIndex, hasStarted, interview, submissionId])

  // Measure signature container so canvas pixel width matches displayed width
  useEffect(() => {
    const container = bondSigContainerRef.current
    if (!container) return

    const measure = () => {
      setBondSigWidth(container.clientWidth)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  // Keep perf refs in sync with their state counterparts
  useEffect(() => { hasStartedRef.current = hasStarted }, [hasStarted])
  useEffect(() => { submissionIdRef.current = submissionId }, [submissionId])

  // Handle code change
  const handleCodeChange = (questionId: string, code: string | undefined) => {
    if (code === undefined) return

    setCodeAnswers((prev) => {
      const updated = { ...prev, [questionId]: code }
      codeAnswersRef.current = updated   // keep ref in sync immediately
      return updated
    })

    // Debounce localStorage writes — at most once every 2 s to avoid blocking the main thread
    if (lsDebounceRef.current) clearTimeout(lsDebounceRef.current)
    lsDebounceRef.current = setTimeout(() => {
      try { localStorage.setItem(ANSWERS_KEY, JSON.stringify(codeAnswersRef.current)) } catch { }
    }, 2000)

    // Track code change (already debounced to 5 s inside createCodeChangeTracker)
    if (codeChangeTrackerRef.current) {
      codeChangeTrackerRef.current(code.length)
    }
  }

  // Navigation — save fires in the background so the question switch is instant
  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      const currentQuestionId =
        interview?.questions?.[currentQuestionIndex]?.id || currentQuestionIndex.toString()
      autoSaveCode(currentQuestionId, codeAnswersRef.current[currentQuestionId] || '')
      setCurrentQuestionIndex(currentQuestionIndex - 1)
    }
  }

  const handleNextQuestion = () => {
    if (interview && currentQuestionIndex < interview.questions!.length - 1) {
      const currentQuestionId =
        interview?.questions?.[currentQuestionIndex]?.id || currentQuestionIndex.toString()
      autoSaveCode(currentQuestionId, codeAnswersRef.current[currentQuestionId] || '')
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    }
  }

  // Check if all answers are empty (unattempted)
  const hasAllEmptyAnswers = (): boolean => {
    if (!interview?.questions) return false
    return interview.questions.every((q, idx) => {
      const questionId = q.id || idx.toString()
      const currentCode = (codeAnswers[questionId] || '').trim()
      return currentCode === ''
    })
  }

  const handleSubmit = async () => {
    if (hasAllEmptyAnswers()) {
      setEmptySubmitDialogOpen(true)
    } else {
      setSubmitDialogOpen(true)
    }
  }

  const confirmSubmit = async () => {
    setSubmitDialogOpen(false)

    try {
      setLoading(true)

      // Save all answers first
      if (interview) {
        for (let i = 0; i < interview.questions!.length; i++) {
          const questionId = interview.questions![i].id || i.toString()
          const code = codeAnswers[questionId] || ''
          await saveCode({
            submission_id: submissionId,
            question_id: questionId,
            code,
            programming_language: interview.programming_language,
          })
        }
      }

      // Check if signature is required
      if (interview?.require_signature) {
        if (interview.bond_timing === 'before_start') {
          // Bond already signed before start — submit directly with the stored signature
          await submitInterview(submissionId, { signature_data: bondSignatureData || undefined, terms_accepted: true })
          antiCheatingRef.current?.cleanup()
          clearSession()
          toast.success('Interview submitted successfully!')
          router.push(`/interview/${accessToken}/thank-you`)
        } else {
          // before_submission (default): redirect to signature page
          antiCheatingRef.current?.cleanup()
          clearSession()
          toast.info('Please review and sign the bond agreement')
          router.push(`/interview/${accessToken}/signature?submission_id=${submissionId}`)
        }
      } else {
        // No signature required — submit directly
        await submitInterview(submissionId)
        antiCheatingRef.current?.cleanup()
        clearSession()
        toast.success('Interview submitted successfully!')
        router.push(`/interview/${accessToken}/thank-you`)
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit interview')
    } finally {
      setLoading(false)
    }
  }

  // Auto-submit — uses refs so it always has fresh code/submissionId even from timer closure
  const handleAutoSubmit = async () => {
    try {
      // Save all answers
      if (interview) {
        for (let i = 0; i < interview.questions!.length; i++) {
          const questionId = interview.questions![i].id || i.toString()
          const code = codeAnswersRef.current[questionId] || ''
          await saveCode({
            submission_id: submissionIdRef.current,
            question_id: questionId,
            code,
            programming_language: interview.programming_language,
          })
        }
      }

      // Cleanup anti-cheating
      antiCheatingRef.current?.cleanup()

      // Check if signature is required
      if (interview?.require_signature) {
        if (interview.bond_timing === 'before_start') {
          // Bond already signed before start — submit directly with stored signature
          await submitInterview(submissionIdRef.current, { signature_data: bondSignatureData || undefined, terms_accepted: true })
          clearSession()
          toast.info("Time's up! Your assessment has been auto-submitted.")
          router.push(`/interview/${accessToken}/thank-you`)
        } else {
          // before_submission: redirect to signature page
          clearSession()
          toast.info("Time's up! Please sign the bond agreement to complete your submission.")
          router.push(`/interview/${accessToken}/signature?submission_id=${submissionIdRef.current}&auto=true`)
        }
      } else {
        await submitInterview(submissionIdRef.current)
        clearSession()
        toast.info("Time's up! Your assessment has been auto-submitted.")
        router.push(`/interview/${accessToken}/thank-you`)
      }
    } catch (error) {
      console.error('Auto-submit failed:', error)
    }
  }

  // Format time remaining
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  // Loading state
  if (loading && !hasStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-center">Error</CardTitle>
            <CardDescription className="text-center">{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // Pre-start screen
  if (!hasStarted && interview) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-white selection:bg-[#00E5FF]/30 cyber-theme cyber-grid flex overflow-hidden">
        {/* Left Side Panel - Metadata & Instructions */}
        <div className="w-[30%] h-full border-r border-[#1e1e22] cyber-glass p-8 flex flex-col gap-8 overflow-y-auto hidden md:flex">
          <div className="space-y-4">
            <div className="h-12 w-12 bg-[#00E5FF]/10 rounded-sm border border-[#00E5FF]/30 flex items-center justify-center cyber-glow-cyan">
              <Code className="h-6 w-6 text-[#00E5FF]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white mb-1 uppercase tracking-widest">{interview.title}</h1>
              <Badge variant="outline" className="text-[#00E5FF] border-[#00E5FF]/40 rounded-sm text-[10px] font-mono-tech uppercase">
                {interview.interview_type} ASSESSMENT
              </Badge>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-[10px] font-mono-tech text-gray-500 uppercase tracking-widest">Protocol Stats</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-white/5 border border-white/10 rounded-sm">
                  <p className="text-[10px] font-mono-tech text-gray-500 uppercase">Questions</p>
                  <p className="text-lg font-bold font-mono-tech">{interview.questions?.length || 0}</p>
                </div>
                <div className="p-3 bg-white/5 border border-white/10 rounded-sm">
                  <p className="text-[10px] font-mono-tech text-gray-500 uppercase">Points</p>
                  <p className="text-lg font-bold font-mono-tech">{interview.total_marks}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-mono-tech text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1 h-1 bg-[#00E5FF] animate-pulse"></span>
                Security Protocols
              </h3>
              <ul className="space-y-3 text-xs text-gray-400 font-mono-tech">
                <li className="flex gap-2">
                  <span className="text-[#00E5FF]">[01]</span> No tab switching or duplicate windows.
                </li>
                <li className="flex gap-2">
                  <span className="text-[#00E5FF]">[02]</span> Copy-paste disabled across workspace.
                </li>
                <li className="flex gap-2">
                  <span className="text-[#00E5FF]">[03]</span> Auto-save active every 30 seconds.
                </li>
                <li className="flex gap-2">
                  <span className="text-[#00E5FF]">[04]</span> Full system activity monitoring.
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-auto pt-8 border-t border-white/5">
            <div className={`p-4 rounded-sm border ${timerExpired ? 'border-red-500/30 bg-red-500/5' : 'border-[#FF3D00]/30 bg-[#FF3D00]/5'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Clock className={`h-4 w-4 ${timerExpired ? 'text-red-500' : 'text-[#FF3D00]'}`} />
                <span className="text-[10px] font-mono-tech uppercase text-gray-400">System Expiry</span>
              </div>
              <p className={`text-2xl font-mono-tech font-bold ${timerExpired ? 'text-red-500' : 'text-[#FF3D00]'}`}>
                {formatTime(timeRemaining)}
              </p>
            </div>
          </div>
        </div>

        {/* Right Side - Input Form */}
        <div className="flex-1 h-full overflow-y-auto bg-[#050505] p-6 lg:p-12 flex items-center justify-center">
          <div className="max-w-2xl w-full space-y-12">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tighter text-white uppercase">Candidate Entry</h2>
              <p className="text-gray-500 text-sm">Please provide credentials to initialize the assessment environment.</p>
            </div>

            <div className="space-y-8">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-[10px] font-mono-tech text-gray-500 uppercase">Access Name</Label>
                  <Input
                    id="name"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="FULL NAME"
                    className="bg-white/5 border-white/10 h-12 rounded-sm focus:border-[#00E5FF]/60 focus:ring-1 focus:ring-[#00E5FF]/20 text-white placeholder:text-white/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[10px] font-mono-tech text-gray-500 uppercase">Comm Channel (Email)</Label>
                  <Input
                    id="email"
                    type="email"
                    value={candidateEmail}
                    onChange={(e) => setCandidateEmail(e.target.value)}
                    placeholder="EMAIL ADDRESS"
                    className="bg-white/5 border-white/10 h-12 rounded-sm focus:border-[#00E5FF]/60 focus:ring-1 focus:ring-[#00E5FF]/20 text-white placeholder:text-white/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-[10px] font-mono-tech text-gray-500 uppercase">Contact Link (Optional)</Label>
                <Input
                  id="phone"
                  value={candidatePhone}
                  onChange={(e) => setCandidatePhone(e.target.value)}
                  placeholder="PHONE NUMBER"
                  className="bg-white/5 border-white/10 h-12 rounded-sm focus:border-[#00E5FF]/60 focus:ring-1 focus:ring-[#00E5FF]/20 text-white placeholder:text-white/20"
                />
              </div>

              {/* Resume Upload */}
              {interview.resume_required !== 'disabled' && (
                <div className="space-y-2">
                  <Label htmlFor="resume" className="text-[10px] font-mono-tech text-gray-500 uppercase">
                    Verification Document (Resume) {interview.resume_required === 'mandatory' ? '*' : ''}
                  </Label>
                  <label
                    htmlFor="resume"
                    className="flex items-center gap-3 px-6 py-8 rounded-sm border-2 border-dashed border-white/5 hover:border-[#00E5FF]/30 hover:bg-[#00E5FF]/5 cursor-pointer transition-all bg-white/[0.02]"
                  >
                    {resumeFile ? (
                      <>
                        <FileText className="h-6 w-6 text-[#00E5FF]" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white truncate">{resumeFile.name}</p>
                          <p className="text-[10px] font-mono-tech text-gray-500">{(resumeFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload className="h-6 w-6 text-gray-600" />
                        <div>
                          <p className="text-sm font-medium text-gray-400">SELECT PDF/DOCX SOURCE</p>
                          <p className="text-[10px] font-mono-tech text-gray-600 uppercase">Max size 5MB</p>
                        </div>
                      </>
                    )}
                  </label>
                  <input
                    id="resume"
                    type="file"
                    accept=".pdf,.docx,.doc"
                    className="hidden"
                    onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                  />
                </div>
              )}

              {/* Bond Section - Modern Look */}
              {interview.require_signature && interview.bond_timing === 'before_start' && (
                <div className="border border-[#FF3D00]/20 bg-[#FF3D00]/5 p-6 space-y-6 rounded-sm">
                  <div className="flex items-center gap-2">
                    <PenTool className="h-4 w-4 text-[#FF3D00]" />
                    <h3 className="text-[10px] font-mono-tech font-bold text-[#FF3D00] uppercase tracking-widest">Bond Agreement Authentication</h3>
                  </div>

                  {interview.bond_terms && (
                    <div className="bg-black/40 border border-[#FF3D00]/10 rounded-sm p-4 max-h-40 overflow-y-auto custom-scrollbar">
                      <p className="text-[11px] font-mono-tech text-gray-400 leading-relaxed whitespace-pre-wrap">{interview.bond_terms}</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-mono-tech text-gray-500 uppercase">Input Signature</Label>
                      <div ref={bondSigContainerRef} className="border border-white/10 rounded-sm bg-white/5 cyber-glow-cyan">
                        <SignatureCanvas
                          ref={bondSignatureRef}
                          penColor="#00E5FF"
                          canvasProps={{ 
                            width: bondSigWidth, 
                            height: 120,
                            style: { touchAction: 'none' }
                          }}
                          onEnd={() => {
                            if (bondSignatureRef.current && !bondSignatureRef.current.isEmpty()) {
                              setBondHasSignature(true)
                              setBondSignatureData(bondSignatureRef.current.toDataURL())
                            }
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          bondSignatureRef.current?.clear()
                          setBondHasSignature(false)
                          setBondSignatureData('')
                        }}
                        className="text-[10px] font-mono-tech text-red-500/60 hover:text-red-500 uppercase tracking-widest mt-1"
                      >
                        [Reset Signature]
                      </button>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-black/40 border border-white/5 rounded-sm">
                      <input
                        type="checkbox"
                        id="bondAccept"
                        checked={bondTermsAccepted}
                        onChange={(e) => setBondTermsAccepted(e.target.checked)}
                        className="mt-1 h-3 w-3 rounded-none border-white/20 bg-transparent text-[#00E5FF] focus:ring-0"
                      />
                      <Label htmlFor="bondAccept" className="text-[10px] font-mono-tech text-gray-500 cursor-pointer leading-relaxed">
                        I ACKNOWLEDGE THAT I HAVE READ THE {interview.bond_years || 2}-YEAR BOND PROTOCOL. BY SIGNING, I AGREE TO ALL MANDATORY RETENTION CLAUSES.
                      </Label>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-8">
                <Button
                  onClick={handleStartSubmission}
                  disabled={
                    loading || timerExpired ||
                    (interview.require_signature && interview.bond_timing === 'before_start' && (!bondTermsAccepted || !bondHasSignature))
                  }
                  className="w-full h-14 text-sm font-bold bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-black rounded-sm cyber-glow-cyan shadow-[0_0_20px_rgba(0,229,255,0.2)] transition-all disabled:opacity-30 disabled:grayscale uppercase tracking-widest"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Initializing Link...
                    </>
                  ) : timerExpired ? (
                    'System Link Terminated'
                  ) : (
                    'Initialize Assessment'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Interview screen
  if (hasStarted && interview) {
    const currentQuestion = interview.questions?.[currentQuestionIndex]
    const currentQuestionId = currentQuestion?.id || currentQuestionIndex.toString()
    const currentCode = codeAnswers[currentQuestionId] || ''

    return (
      <div className="h-screen bg-[#0A0A0B] text-white cyber-theme font-mono-tech flex flex-col overflow-hidden">
        {/* Header - IDE Command Bar */}
        <div className="bg-[#141416] border-b border-[#1e1e22] px-4 py-2 flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#00E5FF]/10 border border-[#00E5FF]/30 flex items-center justify-center rounded-sm">
                <Code className="h-4 w-4 text-[#00E5FF]" />
              </div>
              <div>
                <h1 className="text-xs font-bold uppercase tracking-widest leading-none">{interview.title}</h1>
                <p className="text-[10px] text-gray-500 uppercase mt-1">{candidateName}</p>
              </div>
            </div>

            {/* Question Navigator - Mini Pills */}
            <div className="hidden border-l border-white/10 pl-6 md:flex items-center gap-1.5">
              {interview.questions?.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (idx !== currentQuestionIndex) {
                      const fromId = interview.questions?.[currentQuestionIndex]?.id || currentQuestionIndex.toString()
                      autoSaveCode(fromId, codeAnswersRef.current[fromId] || '')
                    }
                    setCurrentQuestionIndex(idx)
                  }}
                  className={`w-7 h-7 flex items-center justify-center text-[10px] rounded-sm transition-all border ${idx === currentQuestionIndex
                    ? 'bg-[#00E5FF] border-[#00E5FF] text-black font-bold cyber-glow-cyan'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Auto-save Status */}
            <div className="hidden sm:flex items-center gap-2 text-[10px] uppercase tracking-widest text-gray-500">
              {autoSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-[#00E5FF]" />
                  <span>Syncing...</span>
                </>
              ) : lastSaved ? (
                <>
                  <CheckCircle className="h-3 w-3 text-green-500/50" />
                  <span>Last Sync: {format(lastSaved, 'HH:mm:ss')}</span>
                </>
              ) : null}
            </div>

            {/* Timer - Tactical Display */}
            <div className={`flex items-center gap-3 px-4 py-1.5 rounded-sm border ${timeRemaining < 300
              ? 'border-[#FF3D00] bg-[#FF3D00]/10 text-[#FF3D00] cyber-glow-orange animate-pulse'
              : 'border-white/10 bg-white/5 text-gray-300'
              }`}>
              <Clock className="h-4 w-4" />
              <span className="text-lg font-bold tabular-nums tracking-tighter">{formatTime(timeRemaining)}</span>
            </div>
          </div>
        </div>

        {/* Main Workspace Layout - Two Panels */}
        <div className="h-[calc(100vh-3.5rem)] flex flex-col lg:flex-row overflow-hidden">
          {/* Left Panel: Question Content */}
          <div className="w-full lg:w-[35%] h-[40vh] lg:h-full border-b lg:border-r border-[#1e1e22] flex flex-col overflow-hidden bg-[#0A0A0B]">
            <div className="p-4 lg:p-6 overflow-y-auto flex-1 space-y-6 lg:space-y-8 custom-scrollbar">
              <div className="space-y-3 lg:space-y-4">
                <div className="flex items-center justify-between font-mono">
                  <h2 className="text-[10px] lg:text-[11px] font-black uppercase tracking-[0.4em] text-[#00E5FF]">Question_{currentQuestionIndex + 1}</h2>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[8px] lg:text-[9px] border-white/5 text-gray-500 font-normal uppercase rounded-none bg-white/[0.02]">
                      {currentQuestion?.difficulty}
                    </Badge>
                    <Badge variant="outline" className="text-[8px] lg:text-[9px] border-[#00E5FF]/20 text-[#00E5FF] font-normal uppercase rounded-none bg-[#00E5FF]/[0.02]">
                      {currentQuestion?.marks} PTS
                    </Badge>
                  </div>
                </div>
                <div className="prose prose-invert prose-sm max-w-none">
                  <div className="text-gray-300 text-[12px] lg:text-[13px] leading-relaxed whitespace-pre-wrap font-sans opacity-90">
                    {currentQuestion?.question_text}
                  </div>
                </div>
              </div>
            </div>

            {/* Panel Footer: Navigator Controls */}
            <div className="p-3 lg:p-4 border-t border-[#1e1e22] bg-[#141416] flex items-center justify-between">
              <Button
                onClick={handlePreviousQuestion}
                disabled={currentQuestionIndex === 0}
                variant="ghost"
                className="text-[9px] lg:text-[10px] uppercase text-[#00E5FF] hover:text-[#00E5FF] hover:bg-[#00E5FF]/5 rounded-none h-8 lg:h-10 px-3 lg:px-4 tracking-widest font-bold flex items-center border border-[#00E5FF]/10 disabled:opacity-30"
              >
                <ChevronLeft className="mr-1 h-3 w-3" />
                Prev
              </Button>

              <span className="text-[8px] lg:text-[9px] text-gray-600 uppercase tracking-[0.2em] font-black">
                {currentQuestionIndex + 1} / {interview.questions?.length}
              </span>

              {currentQuestionIndex < interview.questions!.length - 1 ? (
                <Button
                  onClick={handleNextQuestion}
                  variant="ghost"
                  className="text-[9px] lg:text-[10px] uppercase text-[#00E5FF] hover:text-[#00E5FF] hover:bg-[#00E5FF]/5 rounded-none h-8 lg:h-10 px-3 lg:px-4 tracking-widest font-bold flex items-center border border-[#00E5FF]/10 group/next"
                >
                  Next
                  <ChevronRight className="h-3 w-3 ml-1 group-hover/next:translate-x-0.5 transition-transform" />
                </Button>
              ) : (
                <div className="w-[60px] lg:w-[100px]"></div>
              )}
            </div>
          </div>

          {/* Right Panel: Code Editor */}
          <div className="flex-1 h-[60vh] lg:h-full flex flex-col bg-[#0A0A0B] border-t lg:border-l border-[#1e1e22] overflow-hidden">
            {/* Editor Header - System Status */}
            <div className="h-9 lg:h-10 border-b border-[#1e1e22] bg-[#141416] px-3 lg:px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 lg:gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-pulse"></div>
                  <span className="text-[8px] lg:text-[9px] uppercase tracking-[0.2em] font-black text-[#00E5FF]">Terminal_Active</span>
                </div>
                <div className="hidden sm:block h-3 w-[1px] bg-white/10 mx-1"></div>
                <div className="hidden sm:flex items-center gap-1.5">
                  <span className="text-[8px] lg:text-[9px] uppercase tracking-[0.2em] font-bold text-gray-500">Buffer:</span>
                  <span className="text-[8px] lg:text-[9px] uppercase tracking-[0.2em] font-bold text-gray-300">{interview.programming_language}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[8px] lg:text-[9px] uppercase tracking-[0.2em] font-bold text-gray-600">Secure_Sync</span>
              </div>
            </div>

            {/* Main Editor Canvas */}
            <div className="flex-1 relative group bg-[#0A0A0B] overflow-hidden flex flex-col min-h-0">
              {/* Highlight Overlay */}
              <div className="absolute inset-0 border border-[#00E5FF]/5 pointer-events-none z-30 group-focus-within:border-[#00E5FF]/20 transition-all"></div>

              <CodeEditor
                value={currentCode}
                onChange={(code) => handleCodeChange(currentQuestionId, code)}
                language={interview.programming_language}
                className="z-10 h-full"
              />

              {/* Floating Editor Label */}
              <div className="absolute top-4 right-6 pointer-events-none opacity-10 group-focus-within:opacity-5 transition-opacity z-20 hidden lg:block">
                <p className="text-[40px] font-black uppercase tracking-[0.5em] text-white/5 rotate-12 select-none">SOURCE_CODE</p>
              </div>
            </div>

            {/* Action Bar */}
            <div className="h-12 lg:h-14 border-t border-[#1e1e22] bg-[#141416] px-4 lg:px-6 flex items-center justify-between shrink-0">
              <div className="hidden sm:flex items-center gap-6">
                <div className="text-[9px] lg:text-[10px] text-gray-500 uppercase flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-gray-700"></div>
                  <span>System_Ready</span>
                </div>
              </div>

              {currentQuestionIndex === interview.questions!.length - 1 && (
                <Button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-black font-black uppercase text-[9px] lg:text-[10px] tracking-[0.2em] lg:tracking-[0.3em] px-6 lg:px-10 rounded-sm cyber-glow-cyan h-8 lg:h-10 transition-all hover:scale-[1.02] active:scale-[0.98] w-full sm:w-auto"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Transmitting...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Send className="h-3 w-3" />
                      <span>Submit Interview</span>
                    </div>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Dialogs - Styled with Cyber Theme */}
        <ConfirmDialog
          open={emptySubmitDialogOpen}
          onOpenChange={setEmptySubmitDialogOpen}
          onConfirm={() => {
            setEmptySubmitDialogOpen(false)
            setSubmitDialogOpen(true)
          }}
          title="PROTOCOL WARNING: EMPTY DATA"
          description="Your solution buffer appears to be empty or uninitialized. Initializing submission without data will result in 0 score. Proceed?"
          confirmText="CONSENT & SUBMIT"
        />

        <ConfirmDialog
          open={submitDialogOpen}
          onOpenChange={setSubmitDialogOpen}
          onConfirm={confirmSubmit}
          title="FINALIZE ASSESSMENT"
          description="Confirming terminal submission will lock all answer buffers and terminate your session. Proceed?"
          confirmText="Submit Interview"
        />
      </div>
    )
  }

  return null
}
