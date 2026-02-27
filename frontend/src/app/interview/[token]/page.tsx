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
} from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  joinInterview,
  startSubmission,
  saveCode,
  submitInterview,
  uploadResume,
  type Interview,
} from '@/lib/api/coding-interviews'
import { initializeAntiCheating, createCodeChangeTracker } from '@/lib/anti-cheating'
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

  // Anti-cheating
  const antiCheatingRef = useRef<ReturnType<typeof initializeAntiCheating> | null>(null)
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

      // Initialize anti-cheating
      const currentQuestionId = interview?.questions?.[0]?.id || '0'
      antiCheatingRef.current = initializeAntiCheating(response.submission_id, currentQuestionId)
      codeChangeTrackerRef.current = createCodeChangeTracker(response.submission_id, currentQuestionId)

      toast.success('Interview started! Good luck!')
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

  // Timer countdown
  useEffect(() => {
    if (!hasStarted || timeRemaining <= 0) return

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setTimerExpired(true)
          handleAutoSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [hasStarted, timeRemaining])

  // Update anti-cheating tracker when question changes
  useEffect(() => {
    if (!hasStarted || !interview) return

    const currentQuestionId = interview.questions?.[currentQuestionIndex]?.id || currentQuestionIndex.toString()
    antiCheatingRef.current?.updateQuestionId(currentQuestionId)
    codeChangeTrackerRef.current = createCodeChangeTracker(submissionId, currentQuestionId)
  }, [currentQuestionIndex, hasStarted, interview, submissionId])

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

  const handleSubmit = async () => {
    setSubmitDialogOpen(true)
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

      // Submit interview
      await submitInterview(submissionId)

      // Cleanup anti-cheating
      antiCheatingRef.current?.cleanup()

      toast.success('Interview submitted successfully!')
      router.push(`/interview/${accessToken}/thank-you`)
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

      // Submit interview
      await submitInterview(submissionId)

      // Cleanup anti-cheating
      antiCheatingRef.current?.cleanup()

      toast.info("Time's up! Your interview has been auto-submitted.")
      router.push(`/interview/${accessToken}/thank-you`)
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
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full">
          <CardHeader>
            <div className="mx-auto w-12 h-12 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full flex items-center justify-center mb-4">
              <Code className="h-6 w-6 text-white" />
            </div>
            <CardTitle className="text-2xl text-center">{interview.title}</CardTitle>
            {interview.description && (
              <CardDescription className="text-center">{interview.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Interview Info */}
            <div className="grid gap-4 md:grid-cols-2 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Interview Type</p>
                <p className="font-semibold">{interview.interview_type.toUpperCase()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Programming Language</p>
                <p className="font-semibold">{interview.programming_language.toUpperCase()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Questions</p>
                <p className="font-semibold">{interview.questions?.length || 0}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Marks</p>
                <p className="font-semibold">{interview.total_marks}</p>
              </div>
            </div>

            {/* Candidate Details */}
            <div className="space-y-4">
              <h3 className="font-semibold">Your Details</h3>
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  placeholder="Enter your full name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={candidateEmail}
                  onChange={(e) => setCandidateEmail(e.target.value)}
                  placeholder="Enter your email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  value={candidatePhone}
                  onChange={(e) => setCandidatePhone(e.target.value)}
                  placeholder="Enter your phone number"
                />
              </div>

              {/* Resume Upload */}
              {interview.resume_required !== 'disabled' && (
                <div className="space-y-2">
                  <Label htmlFor="resume">
                    Resume {interview.resume_required === 'mandatory' ? '*' : '(optional)'}
                  </Label>
                  <div className="flex items-center gap-3">
                    <label
                      htmlFor="resume"
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-gray-300 hover:border-indigo-500 cursor-pointer transition-colors w-full"
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
                </div>
              )}
            </div>

            {/* Time Info */}
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                <Clock className="inline h-4 w-4 mr-1" />
                Time Remaining: <strong>{formatTime(timeRemaining)}</strong>
              </p>
            </div>

            <Button
              onClick={handleStartSubmission}
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
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
