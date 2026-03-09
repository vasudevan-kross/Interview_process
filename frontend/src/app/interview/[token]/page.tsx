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

  // Load interview details
  useEffect(() => {
    loadInterview()
  }, [accessToken])

  const loadInterview = async () => {
    try {
      setLoading(true)
      const data = await joinInterview(accessToken)
      setInterview(data)

      // Initialize code answers with starter code
      const initialAnswers: Record<string, string> = {}
      data.questions?.forEach((q, idx) => {
        initialAnswers[q.id || idx.toString()] = q.starter_code || ''
      })
      setCodeAnswers(initialAnswers)

      // Calculate time remaining
      const expires = new Date(data.link_expires_at)
      const now = new Date()
      const diff = Math.floor((expires.getTime() - now.getTime()) / 1000)
      setTimeRemaining(Math.max(0, diff))
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
  useEffect(() => {
    if (!hasStarted || !interview) return

    const interval = setInterval(() => {
      const currentQuestionId = interview.questions?.[currentQuestionIndex]?.id || currentQuestionIndex.toString()
      const currentCode = codeAnswers[currentQuestionId] || ''
      autoSaveCode(currentQuestionId, currentCode)
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [hasStarted, currentQuestionIndex, codeAnswers, autoSaveCode, interview])

  // Timer countdown - runs on both pre-start and interview screens
  useEffect(() => {
    if (!interview || timeRemaining <= 0) return

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setTimerExpired(true)
          // Only auto-submit if the interview has actually started
          if (hasStarted) {
            handleAutoSubmit()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [interview, hasStarted, timeRemaining])

  // Update anti-cheating tracker when question changes
  useEffect(() => {
    if (!hasStarted || !interview) return

    const currentQuestionId = interview.questions?.[currentQuestionIndex]?.id || currentQuestionIndex.toString()
    antiCheatingRef.current?.updateQuestionId(currentQuestionId)
    codeChangeTrackerRef.current = createCodeChangeTracker(submissionId, currentQuestionId)
  }, [currentQuestionIndex, hasStarted, interview, submissionId])

  // Measure signature container so canvas pixel width matches displayed width
  useEffect(() => {
    const measure = () => {
      if (bondSigContainerRef.current) {
        setBondSigWidth(bondSigContainerRef.current.clientWidth)
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Handle code change
  const handleCodeChange = (questionId: string, code: string | undefined) => {
    if (code === undefined) return

    setCodeAnswers((prev) => ({ ...prev, [questionId]: code }))

    // Track code change
    if (codeChangeTrackerRef.current) {
      codeChangeTrackerRef.current(code.length)
    }
  }

  // Navigation
  const handlePreviousQuestion = async () => {
    if (currentQuestionIndex > 0) {
      // Save current code before navigating
      const currentQuestionId =
        interview?.questions?.[currentQuestionIndex]?.id || currentQuestionIndex.toString()
      await autoSaveCode(currentQuestionId, codeAnswers[currentQuestionId] || '')
      setCurrentQuestionIndex(currentQuestionIndex - 1)
    }
  }

  const handleNextQuestion = async () => {
    if (interview && currentQuestionIndex < interview.questions!.length - 1) {
      // Save current code before navigating
      const currentQuestionId =
        interview?.questions?.[currentQuestionIndex]?.id || currentQuestionIndex.toString()
      await autoSaveCode(currentQuestionId, codeAnswers[currentQuestionId] || '')
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    }
  }

  // Check if all answers are empty or match starter code (unattempted)
  const hasAllEmptyOrStarterCode = (): boolean => {
    if (!interview?.questions) return false
    return interview.questions.every((q, idx) => {
      const questionId = q.id || idx.toString()
      const currentCode = (codeAnswers[questionId] || '').trim()
      const starter = (q.starter_code || '').trim()
      return currentCode === '' || currentCode === starter
    })
  }

  const handleSubmit = async () => {
    if (hasAllEmptyOrStarterCode()) {
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
          toast.success('Interview submitted successfully!')
          router.push(`/interview/${accessToken}/thank-you`)
        } else {
          // before_submission (default): redirect to signature page
          antiCheatingRef.current?.cleanup()
          toast.info('Please review and sign the bond agreement')
          router.push(`/interview/${accessToken}/signature?submission_id=${submissionId}`)
        }
      } else {
        // No signature required — submit directly
        await submitInterview(submissionId)
        antiCheatingRef.current?.cleanup()
        toast.success('Interview submitted successfully!')
        router.push(`/interview/${accessToken}/thank-you`)
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit interview')
    } finally {
      setLoading(false)
    }
  }

  // Auto-submit
  const handleAutoSubmit = async () => {
    try {
      // Save all answers
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

      // Cleanup anti-cheating
      antiCheatingRef.current?.cleanup()

      // Check if signature is required
      if (interview?.require_signature) {
        if (interview.bond_timing === 'before_start') {
          // Bond already signed before start — submit directly with stored signature
          await submitInterview(submissionId, { signature_data: bondSignatureData || undefined, terms_accepted: true })
          toast.info("Time's up! Your assessment has been auto-submitted.")
          router.push(`/interview/${accessToken}/thank-you`)
        } else {
          // before_submission: redirect to signature page
          toast.info("Time's up! Please sign the bond agreement to complete your submission.")
          router.push(`/interview/${accessToken}/signature?submission_id=${submissionId}&auto=true`)
        }
      } else {
        await submitInterview(submissionId)
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
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
        <Card className="max-w-4xl w-full shadow-xl">
          <CardHeader className="pb-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-lg">
            <div className="mx-auto w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mb-3">
              <Code className="h-6 w-6 text-white" />
            </div>
            <CardTitle className="text-2xl text-center">{interview.title}</CardTitle>
            {interview.description && (
              <CardDescription className="text-center text-indigo-100">{interview.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            {/* Interview Info */}
            <div className="grid gap-4 md:grid-cols-4 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200">
              <div>
                <p className="text-xs text-gray-500 mb-1">Interview Type</p>
                <p className="font-semibold text-sm">{interview.interview_type.toUpperCase()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">
                  {interview.interview_type === 'testing' ? 'Test Framework' : 'Programming Language'}
                </p>
                <p className="font-semibold text-sm">{interview.programming_language.toUpperCase()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Total Questions</p>
                <p className="font-semibold text-sm">{interview.questions?.length || 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Total Marks</p>
                <p className="font-semibold text-sm">{interview.total_marks}</p>
              </div>
            </div>

            {/* Important Information - Side by Side */}
            <div className="grid md:grid-cols-2 gap-3">
              {/* Test Instructions */}
              <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg">
                <p className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <span>📋</span> Instructions
                </p>
                <ul className="text-xs text-gray-700 space-y-1.5">
                  <li>• Write code in any language</li>
                  <li>• Auto-saved every 30 seconds</li>
                  <li>• No tab switching or copy-paste</li>
                  <li>• Submit before time expires</li>
                  <li>• All activities are monitored</li>
                </ul>
              </div>

              {/* Bond Agreement Notice — only shown here for before_submission timing */}
              {interview.require_signature && interview.bond_timing !== 'before_start' && (
                <div className="p-4 bg-amber-50 border-l-4 border-amber-500 rounded-lg">
                  <p className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-2">
                    <span>⚠️</span> Bond Agreement Required
                  </p>
                  <ul className="text-xs text-amber-800 space-y-1.5">
                    <li>• Digital signature required after submission</li>
                    <li>• {interview.bond_years || 2} year bond period</li>
                    <li>• Certificates collected until completion</li>
                    {interview.bond_document_url && (
                      <li>
                        •{' '}
                        <a href={interview.bond_document_url} target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 hover:underline font-medium">
                          View bond document
                        </a>
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            {/* Candidate Details */}
            <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
              <h3 className="font-semibold text-base mb-4 text-gray-800">Your Details</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm">Full Name *</Label>
                  <Input
                    id="name"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="Enter your full name"
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={candidateEmail}
                    onChange={(e) => setCandidateEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-sm">Phone (optional)</Label>
                  <Input
                    id="phone"
                    value={candidatePhone}
                    onChange={(e) => setCandidatePhone(e.target.value)}
                    placeholder="Enter your phone number"
                    className="h-10"
                  />
                </div>

                {/* Resume Upload */}
                {interview.resume_required !== 'disabled' && (
                  <div className="space-y-2">
                    <Label htmlFor="resume" className="text-sm">
                      Resume {interview.resume_required === 'mandatory' ? '*' : '(optional)'}
                    </Label>
                    <label
                      htmlFor="resume"
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-gray-300 hover:border-indigo-500 cursor-pointer transition-colors w-full bg-white"
                    >
                      {resumeFile ? (
                        <>
                          <FileText className="h-5 w-5 text-green-600" />
                          <span className="text-sm text-green-700 truncate">{resumeFile.name}</span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-5 w-5 text-gray-400" />
                          <span className="text-sm text-gray-500">Upload PDF or DOCX</span>
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
              </div>
            </div>

            {/* Bond Agreement — shown inline before start when bond_timing === 'before_start' */}
            {interview.require_signature && interview.bond_timing === 'before_start' && (
              <div className="border border-amber-300 bg-amber-50 rounded-lg p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <PenTool className="h-5 w-5 text-amber-600" />
                  <h3 className="font-semibold text-amber-900">Bond Agreement — Sign Before Starting</h3>
                </div>

                {/* Bond terms text */}
                {interview.bond_terms && (
                  <div className="bg-white border border-amber-200 rounded-md p-4 max-h-48 overflow-y-auto">
                    <p className="text-xs text-gray-700 whitespace-pre-wrap">{interview.bond_terms}</p>
                  </div>
                )}

                {interview.bond_document_url && (
                  <a href={interview.bond_document_url} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    View full bond document
                  </a>
                )}

                {/* Signature pad */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-amber-900">Your Signature *</Label>
                  <div ref={bondSigContainerRef} className="border-2 border-amber-300 rounded-lg bg-white overflow-hidden">
                    <SignatureCanvas
                      ref={bondSignatureRef}
                      penColor="black"
                      canvasProps={{ width: bondSigWidth, height: 120 }}
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
                    className="text-xs text-red-600 hover:underline"
                  >
                    Clear signature
                  </button>
                </div>

                {/* Accept checkbox */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="bondAccept"
                    checked={bondTermsAccepted}
                    onChange={(e) => setBondTermsAccepted(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="bondAccept" className="text-sm text-amber-900 cursor-pointer leading-relaxed">
                    I have read and agree to the bond terms above. I understand this is a {interview.bond_years || 2}-year bond agreement
                    and my signature constitutes a legally binding acceptance.
                  </Label>
                </div>
              </div>
            )}

            {/* Time Info */}
            <div className={`p-3 rounded-lg border-l-4 ${timerExpired
              ? 'bg-red-50 border-red-500'
              : timeRemaining < 300
                ? 'bg-orange-50 border-orange-500'
                : 'bg-blue-50 border-blue-500'
              }`}>
              <p className={`text-sm font-medium ${timerExpired
                ? 'text-red-800'
                : timeRemaining < 300
                  ? 'text-orange-800'
                  : 'text-blue-800'
                }`}>
                <Clock className="inline h-4 w-4 mr-2" />
                {timerExpired ? (
                  <strong>Time has expired. You can no longer start this interview.</strong>
                ) : (
                  <>Time Remaining: <strong>{formatTime(timeRemaining)}</strong></>
                )}
              </p>
            </div>

            <Button
              onClick={handleStartSubmission}
              disabled={
                loading || timerExpired ||
                (interview.require_signature && interview.bond_timing === 'before_start' && (!bondTermsAccepted || !bondHasSignature))
              }
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : timerExpired ? (
                'Interview Expired'
              ) : (
                'Start Interview'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Interview screen
  if (hasStarted && interview) {
    const currentQuestion = interview.questions?.[currentQuestionIndex]
    const currentQuestionId = currentQuestion?.id || currentQuestionIndex.toString()
    const currentCode = codeAnswers[currentQuestionId] || ''

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div>
              <h1 className="font-semibold">{interview.title}</h1>
              <p className="text-sm text-gray-600">{candidateName}</p>
            </div>

            <div className="flex items-center gap-4">
              {/* Auto-save indicator */}
              <div className="flex items-center gap-2 text-sm">
                {autoSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span className="text-gray-600">Saving...</span>
                  </>
                ) : lastSaved ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-gray-600">
                      Saved at {format(lastSaved, 'HH:mm:ss')}
                    </span>
                  </>
                ) : null}
              </div>

              {/* Timer */}
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${timeRemaining < 300 ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                }`}>
                <Clock className="h-5 w-5" />
                <span className="font-mono text-lg font-bold">{formatTime(timeRemaining)}</span>
              </div>
            </div>
          </div>

          {/* Question Navigator */}
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 overflow-x-auto">
            {interview.questions?.map((q, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentQuestionIndex(idx)}
                className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${idx === currentQuestionIndex
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                Q{idx + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto p-4 space-y-4">
          {/* Question */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Question {currentQuestionIndex + 1}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{currentQuestion?.difficulty}</Badge>
                  <Badge>{currentQuestion?.marks} marks</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{currentQuestion?.question_text}</p>
            </CardContent>
          </Card>

          {/* Code Editor */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your Solution</CardTitle>
            </CardHeader>
            <CardContent>
              <CodeEditor
                value={currentCode}
                onChange={(code) => handleCodeChange(currentQuestionId, code)}
                language={interview.programming_language}
                height="60vh"
              />
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              onClick={handlePreviousQuestion}
              disabled={currentQuestionIndex === 0}
              variant="outline"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>

            <div className="text-sm text-gray-600">
              Question {currentQuestionIndex + 1} of {interview.questions?.length}
            </div>

            {currentQuestionIndex < interview.questions!.length - 1 ? (
              <Button onClick={handleNextQuestion}>
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-gradient-to-r from-green-600 to-green-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit Interview
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Warning: all answers empty / starter code */}
          <ConfirmDialog
            open={emptySubmitDialogOpen}
            onOpenChange={setEmptySubmitDialogOpen}
            onConfirm={() => {
              setEmptySubmitDialogOpen(false)
              setSubmitDialogOpen(true)
            }}
            title="⚠️ Answers Look Empty"
            description={
              `All your answers appear to be empty or still contain only the default starter code. ` +
              `Are you sure you want to submit without attempting the questions?`
            }
            confirmText="Yes, Submit Anyway"
          />

          <ConfirmDialog
            open={submitDialogOpen}
            onOpenChange={setSubmitDialogOpen}
            onConfirm={confirmSubmit}
            title="Submit Interview"
            description="Are you sure you want to submit? You cannot change your answers after submission."
            confirmText="Submit"
          />
        </div>
      </div>
    )
  }

  return null
}
